import "server-only";
import { requireMerchant } from "../auth/session";
import { createAdminClient } from "../supabase/admin";
import { EVIDENCE_BUCKET } from "../storage/evidence";
import { buildDemoResetPlan } from "./reset-fixtures";

export class DemoResetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DemoResetError";
  }
}

async function checked<T>(operation: PromiseLike<{ data: T; error: { message: string } | null }>, label: string) {
  const { data, error } = await operation;
  if (error) throw new DemoResetError(`${label} failed`);
  return data;
}

/** Reset only the configured demo merchant. Active work needs explicit confirmation. */
export async function resetDemoForCurrentMerchant({ allowActiveCaseDeletion = false }: { allowActiveCaseDeletion?: boolean } = {}) {
  if (process.env.DEMO_MODE !== "true") throw new DemoResetError("Demo mode is off");
  const expectedEmail = process.env.DEMO_USER_EMAIL?.trim().toLowerCase();
  if (!expectedEmail) throw new DemoResetError("Demo account is not configured");
  const { supabase, userId } = await requireMerchant();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || auth.user?.id !== userId || auth.user.email?.toLowerCase() !== expectedEmail) {
    throw new DemoResetError("Only the configured demo account can reset its history");
  }
  const admin = createAdminClient();
  const plan = buildDemoResetPlan(userId);
  const { data: existingCases, error: existingCaseError } = await admin.from("cases")
    .select("id").eq("user_id", userId).limit(1000);
  if (existingCaseError) throw new DemoResetError("Could not inspect existing demo cases");
  if (!allowActiveCaseDeletion && (existingCases?.length ?? 0) === 1000) {
    throw new DemoResetError("Too many demo cases to inspect safely. Confirm deleting them before resetting the demo.");
  }
  const seedCaseIds = new Set(plan.cases.map((item) => String(item.id)));
  if (!allowActiveCaseDeletion && (existingCases ?? []).some((item) => !seedCaseIds.has(item.id))) {
    throw new DemoResetError("Active delivery cases exist. Confirm deleting them before resetting the demo.");
  }
  const { data: priorArtifacts, error: priorError } = await admin.from("artifacts")
    .select("storage_path").eq("user_id", userId).limit(1000);
  if (priorError) throw new DemoResetError("Could not inspect existing demo evidence");

  const bucket = admin.storage.from(EVIDENCE_BUCKET);
  for (const file of plan.files) {
    const { error } = await bucket.upload(file.path, new Blob([file.text], { type: "text/plain" }), {
      contentType: "text/plain", upsert: true,
    });
    if (error) throw new DemoResetError("Could not stage synthetic demo evidence");
  }

  await checked(admin.from("cases").delete().eq("user_id", userId), "Removing old demo cases");
  await checked(admin.from("suppliers").delete().eq("user_id", userId), "Removing old demo suppliers");
  await checked(admin.from("profiles").upsert({ id: userId, business_name: plan.summary.businessName,
    business_type: "pharmacy", preferred_locale: "en-IN" }), "Restoring demo business");
  await checked(admin.from("suppliers").insert(plan.suppliers), "Restoring demo suppliers");
  await checked(admin.from("cases").insert(plan.cases), "Restoring demo cases");
  await checked(admin.from("artifacts").insert(plan.artifacts), "Restoring demo evidence records");
  await checked(admin.from("recovery_obligations").insert(plan.obligations), "Restoring recovery obligations");
  await checked(admin.from("supplier_messages").insert(plan.supplierMessages), "Restoring supplier messages");
  await checked(admin.from("recovery_verifications").insert(plan.verifications), "Restoring verified history");
  await checked(admin.from("case_events").insert(plan.events), "Restoring case timeline");

  const currentPaths = new Set(plan.files.map((file) => file.path));
  const stalePaths = (priorArtifacts ?? []).map((artifact) => artifact.storage_path)
    .filter((path) => !currentPaths.has(path));
  for (let index = 0; index < stalePaths.length; index += 100) {
    // Storage cleanup follows the successful database reset. Orphaned old blobs
    // are not visible from cases if cleanup needs a later retry.
    await bucket.remove(stalePaths.slice(index, index + 100));
  }
  return { ...plan.summary, syntheticDemoHistory: true };
}
