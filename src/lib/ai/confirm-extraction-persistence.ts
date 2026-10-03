import "server-only";
import { z } from "zod";
import { assertCaseOwnership, CaseAccessError } from "../auth/case-access";
import { requireMerchant } from "../auth/session";
import { createAdminClient } from "../supabase/admin";
import {
  ConfirmationError,
  confirmExtractionInputSchema,
  prepareConfirmedExtraction,
  type ConfirmableType,
} from "./confirm-extraction";

const caseRowSchema = z.object({ status: z.string() });
const artifactRowSchema = z.object({
  type: z.enum(["invoice", "agreement", "receiving_photo", "damage_photo", "credit_note", "corrected_invoice", "other"]),
  extraction_status: z.string(),
  extracted: z.unknown(),
});

/** Confirm a merchant's uncertain extraction without allowing arbitrary fact replacement. */
export async function confirmEvidenceExtraction(unparsedInput: unknown) {
  const input = confirmExtractionInputSchema.parse(unparsedInput);
  const { supabase, userId } = await requireMerchant();
  await assertCaseOwnership(supabase, input.caseId, userId);

  const { data: rawCase, error: caseError } = await supabase.from("cases")
    .select("status")
    .eq("id", input.caseId)
    .eq("user_id", userId)
    .maybeSingle();
  if (caseError) throw caseError;
  if (!rawCase) throw new CaseAccessError();
  const caseRow = caseRowSchema.parse(rawCase);
  if (!["DRAFT", "EVIDENCE_CAPTURED"].includes(caseRow.status)) {
    throw new ConfirmationError("Evidence cannot be changed after reconciliation", 409);
  }

  const { data: rawArtifact, error: artifactError } = await supabase.from("artifacts")
    .select("type, extraction_status, extracted")
    .eq("id", input.artifactId)
    .eq("case_id", input.caseId)
    .eq("user_id", userId)
    .maybeSingle();
  if (artifactError) throw artifactError;
  if (!rawArtifact) throw new CaseAccessError();
  const artifact = artifactRowSchema.parse(rawArtifact);
  if (artifact.type !== "invoice" && artifact.type !== "agreement") {
    throw new ConfirmationError("Only invoice or agreement evidence can be confirmed here", 400);
  }
  if (artifact.extraction_status !== "needs_confirmation") {
    throw new ConfirmationError("The latest extraction is not awaiting confirmation", 409);
  }

  const prepared = prepareConfirmedExtraction(
    artifact.extracted,
    artifact.type as ConfirmableType,
    input.artifactId,
    input,
    userId,
    new Date().toISOString(),
  );
  const admin = createAdminClient();
  const { data: updated, error: updateError } = await admin.from("artifacts")
    .update({ extracted: prepared.stored, extraction_status: "complete" })
    .eq("id", input.artifactId)
    .eq("case_id", input.caseId)
    .eq("user_id", userId)
    .eq("type", artifact.type)
    .eq("extraction_status", "needs_confirmation")
    // The original JSONB value is an optimistic lock: a concurrent re-extraction
    // cannot be silently replaced by a stale merchant confirmation.
    .eq("extracted", JSON.stringify(artifact.extracted))
    .select("id")
    .maybeSingle();
  if (updateError) throw updateError;
  if (!updated) throw new ConfirmationError("Evidence changed while you reviewed it; extract and confirm the latest version", 409);

  const { error: eventError } = await admin.from("case_events").insert({
    case_id: input.caseId,
    user_id: userId,
    event_type: "evidence_merchant_confirmed",
    payload: {
      summary: artifact.type === "invoice" ? "Invoice facts confirmed by merchant" : "Supplier promise confirmed by merchant",
      status: "success",
      details: { artifactId: input.artifactId, ...prepared.audit },
    },
  });
  if (eventError) throw eventError;
  return prepared.result;
}
