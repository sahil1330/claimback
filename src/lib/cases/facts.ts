import "server-only";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { requireMerchant } from "../auth/session";
import { assertCaseOwnership } from "../auth/case-access";
import { createAdminClient } from "../supabase/admin";
import { agreementFactsSchema, invoiceFactsSchema } from "../../types/domain";
import { reconciliationInputSchema, type ReconciliationInput } from "../reconciliation/engine";
import { transitionCaseState } from "./state";
import { appendCaseEvent } from "./events";

const artifactRowSchema = z.object({
  id: z.uuid(),
  type: z.enum(["invoice", "agreement", "receiving_photo", "damage_photo", "credit_note", "corrected_invoice", "other"]),
  extraction_status: z.string(),
  extracted: z.unknown(),
});
type ArtifactRow = z.infer<typeof artifactRowSchema>;

export class CaseFactsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CaseFactsError";
  }
}

function extractedLines(row: ArtifactRow, kind: "promised" | "billed") {
  if (row.extraction_status !== "complete") throw new CaseFactsError("Extract and confirm the source evidence first");
  const schema = kind === "promised" ? agreementFactsSchema : invoiceFactsSchema;
  const result = z.object({ status: z.literal("ready"), facts: schema }).safeParse(row.extracted);
  if (!result.success) throw new CaseFactsError("Source extraction needs confirmation before reconciliation");
  return result.data.facts.lines;
}

/** Verify every commercial line against a registered case artifact. */
export function verifyEvidenceSources(caseId: string, input: ReconciliationInput, unparsedRows: unknown[]) {
  const rows = artifactRowSchema.array().parse(unparsedRows);
  const byId = new Map(rows.map((row) => [row.id, row]));
  for (const [index, group] of input.groups.entries()) {
    for (const kind of ["promised", "billed", "received"] as const) {
      const line = group[kind];
      const row = byId.get(line.source.sourceArtifactId);
      if (kind === "received" && line.source.sourceArtifactId === caseId) {
        // The authenticated merchant's receiving form is itself a primary source.
        if (!group.received.merchantConfirmed || line.source.sourceLabel !== "Merchant-confirmed receiving input" || !line.source.locator) {
          throw new CaseFactsError("Receiving counts need merchant confirmation and a form reference");
        }
        continue;
      }
      if (!row) throw new CaseFactsError(`Source artifact for ${kind} line ${index + 1} is unavailable`);
      if (kind === "promised" && row.type !== "agreement") throw new CaseFactsError("Promised facts need an agreement artifact");
      if (kind === "billed" && row.type !== "invoice") throw new CaseFactsError("Billed facts need an invoice artifact");
      if (kind === "received" && !["receiving_photo", "other"].includes(row.type)) throw new CaseFactsError("Receiving facts need a receiving artifact");
      if (kind === "received") {
        if (!group.received.merchantConfirmed) throw new CaseFactsError("Merchant must confirm receiving quantities and damage");
      } else {
        const lines = extractedLines(row, kind);
        if (!lines.some((stored) => isDeepStrictEqual(stored, line))) {
          throw new CaseFactsError(`The ${kind} line differs from stored source extraction`);
        }
      }
    }
  }
}

/** Persist confirmed, source-checked three-truth groups before an agent can reconcile. */
export async function saveCaseFacts(caseId: string, input: ReconciliationInput) {
  z.uuid().parse(caseId);
  const parsed = reconciliationInputSchema.parse(input);
  const { supabase, userId } = await requireMerchant();
  await assertCaseOwnership(supabase, caseId, userId);
  const sourceIds = [...new Set(parsed.groups.flatMap((group) => [
    group.promised.source.sourceArtifactId,
    group.billed.source.sourceArtifactId,
    group.received.source.sourceArtifactId,
  ]))];
  const { data: rows, error: artifactError } = await supabase.from("artifacts")
    .select("id, type, extraction_status, extracted")
    .eq("case_id", caseId)
    .eq("user_id", userId)
    .in("id", sourceIds);
  if (artifactError) throw artifactError;
  verifyEvidenceSources(caseId, parsed, rows ?? []);

  const admin = createAdminClient();
  const { data: caseRow, error: readError } = await admin.from("cases")
    .select("status")
    .eq("id", caseId)
    .eq("user_id", userId)
    .maybeSingle();
  if (readError) throw readError;
  if (!caseRow || !["DRAFT", "EVIDENCE_CAPTURED"].includes(caseRow.status)) {
    throw new CaseFactsError("Case facts cannot be changed after reconciliation");
  }
  const nextState = caseRow.status === "DRAFT"
    ? transitionCaseState("DRAFT", "EVIDENCE_CAPTURED")
    : "EVIDENCE_CAPTURED";
  const { data: updated, error: updateError } = await admin.from("cases")
    .update({
      promised: { lines: parsed.groups.map((group) => group.promised) },
      billed: { lines: parsed.groups.map((group) => group.billed) },
      received: {
        lines: parsed.groups.map((group) => group.received),
        groups: parsed.groups,
        merchant_confirmed_at: new Date().toISOString(),
      },
      status: nextState,
    })
    .eq("id", caseId)
    .eq("user_id", userId)
    .eq("status", caseRow.status)
    .select("id")
    .maybeSingle();
  if (updateError) throw updateError;
  if (!updated) throw new CaseFactsError("Case changed while saving evidence; retry");
  await appendCaseEvent(admin, {
    caseId, userId, eventType: "evidence_captured",
    summary: "Invoice, supplier promise and receiving facts captured",
    status: "success", details: { groupCount: parsed.groups.length },
  });
  return { caseId, status: nextState, groupCount: parsed.groups.length };
}
