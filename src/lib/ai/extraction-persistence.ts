import "server-only";
import { assertCaseOwnership } from "../auth/case-access";
import { requireMerchant } from "../auth/session";
import { createAdminClient } from "../supabase/admin";
import type { ExtractionResult } from "../../types/domain";

/** Persist only validated facts or a safe recoverable status. */
export async function persistExtractionResult(
  caseId: string,
  artifactId: string,
  result: ExtractionResult<unknown>,
) {
  const { supabase, userId } = await requireMerchant();
  await assertCaseOwnership(supabase, caseId, userId);
  const admin = createAdminClient();
  const status = result.status === "ready" ? "complete"
    : result.status === "needs_confirmation" ? "needs_confirmation" : "failed";
  const extracted = result.status === "error" ? null : result;
  const { data, error } = await admin.from("artifacts")
    .update({ extracted, extraction_status: status })
    .eq("id", artifactId)
    .eq("case_id", caseId)
    .eq("user_id", userId)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Evidence artifact was not found");
}
