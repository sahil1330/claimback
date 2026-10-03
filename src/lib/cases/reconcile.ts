import "server-only";
import { z } from "zod";
import { requireMerchant } from "../auth/session";
import { assertCaseOwnership } from "../auth/case-access";
import { createAdminClient } from "../supabase/admin";
import { agreementFactsSchema, discrepancySchema, invoiceFactsSchema, receivingFactsSchema } from "../../types/domain";
import { reconcileCase, reconciliationInputSchema, transitionForReconciliation } from "../reconciliation/engine";
import { appendCaseEvent } from "./events";
import { supplierResponseSchema } from "../ai/supplier-response";

const storedCaseSchema = z.object({
  id: z.uuid(),
  status: z.string(),
  received: z.unknown(),
  discrepancies: z.unknown(),
  potential_recovery_paise: z.number().int().safe().nonnegative(),
  outstanding_paise: z.number().int().safe().nonnegative(),
});

export class CaseReconciliationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CaseReconciliationError";
  }
}

const draftExtractionSchema = z.object({
  status: z.enum(["ready", "needs_confirmation"]),
  facts: z.unknown(),
  confirmations: z.array(z.object({ field: z.string(), reason: z.string() })),
});
const supplierMessageSchema = z.object({
  id: z.uuid(), direction: z.enum(["inbound", "outbound"]), body: z.string(),
  source: z.string().nullable(), parsed: z.unknown().nullable(), created_at: z.string(),
});
const analyzedSupplierMessageSchema = z.object({ analysis: supplierResponseSchema });

function evidenceForAgent(row: {
  id: string;
  type: string;
  original_name: string | null;
  extraction_status: string;
  extracted: unknown;
}) {
  const base = {
    artifactId: row.id,
    type: row.type,
    fileName: row.original_name,
    extractionStatus: row.extraction_status,
  };
  const extraction = draftExtractionSchema.safeParse(row.extracted);
  if (!extraction.success) return base;
  const factsSchema = row.type === "invoice" ? invoiceFactsSchema
    : row.type === "agreement" ? agreementFactsSchema
      : row.type === "other" ? receivingFactsSchema : null;
  if (!factsSchema) return base;
  const facts = factsSchema.safeParse(extraction.data.facts);
  if (!facts.success) return base;
  return {
    ...base,
    extractionStatus: extraction.data.status,
    draftFacts: facts.data,
    confirmationsNeeded: extraction.data.confirmations.map(({ field, reason }) => ({ field, reason })),
  };
}

/** Read confirmed case facts and separately labelled draft evidence for case-scoped tools. */
export async function inspectCase(caseId: string) {
  z.uuid().parse(caseId);
  const { supabase, userId } = await requireMerchant();
  await assertCaseOwnership(supabase, caseId, userId);
  const { data, error } = await supabase.from("cases")
    .select("id, title, status, supplier_id, promised, billed, received, discrepancies, potential_recovery_paise, recovered_paise, outstanding_paise, merchant_approved_at, claim_sent_at, next_follow_up_at")
    .eq("id", caseId).eq("user_id", userId).single();
  if (error) throw error;
  const { data: artifacts, error: artifactError } = await supabase.from("artifacts")
    .select("id, type, original_name, extraction_status, extracted")
    .eq("case_id", caseId).eq("user_id", userId)
    .order("created_at", { ascending: false }).limit(20);
  if (artifactError) throw artifactError;
  const { data: rawMessages, error: messageError } = await supabase.from("supplier_messages")
    .select("id,direction,body,source,parsed,created_at")
    .eq("case_id", caseId).eq("user_id", userId)
    .order("created_at", { ascending: false }).limit(10);
  if (messageError) throw messageError;
  const seenDraftTypes = new Set<string>();
  const evidence = (artifacts ?? []).filter((row) => {
    if (!["invoice", "agreement", "other"].includes(row.type)) return true;
    if (seenDraftTypes.has(row.type)) return false;
    seenDraftTypes.add(row.type);
    return true;
  }).map(evidenceForAgent);
  const supplierMessages = z.array(supplierMessageSchema).parse(rawMessages ?? []).map((message) => {
    const analysis = analyzedSupplierMessageSchema.safeParse(message.parsed);
    return {
      id: message.id, direction: message.direction, body: message.body.slice(0, 1600),
      status: message.source === "demo_followup_draft" ? "awaiting_merchant_approval"
        : message.direction === "outbound" ? "sent" : "received",
      createdAt: message.created_at,
      decisions: analysis.success ? analysis.data.analysis.decisions : [],
    };
  });
  return { ...data, evidence, supplierMessages };
}

/** Recompute from stored, merchant-confirmed groups; the caller supplies no amounts. */
export async function reconcileStoredCase(caseId: string) {
  z.uuid().parse(caseId);
  const { supabase, userId } = await requireMerchant();
  await assertCaseOwnership(supabase, caseId, userId);
  const admin = createAdminClient();
  const { data, error } = await admin.from("cases")
    .select("id, status, received, discrepancies, potential_recovery_paise, outstanding_paise")
    .eq("id", caseId).eq("user_id", userId).single();
  if (error) throw error;
  const row = storedCaseSchema.parse(data);
  if (row.status !== "EVIDENCE_CAPTURED") {
    throw new CaseReconciliationError("Capture and confirm evidence before reconciliation");
  }
  const input = reconciliationInputSchema.parse(row.received);
  const result = reconcileCase(input);
  if (result.outcome === "needs_confirmation") {
    await appendCaseEvent(admin, {
      caseId, userId, eventType: "reconciliation_needs_confirmation",
      summary: "Facts need merchant confirmation before a claim can be calculated",
      status: "needs_confirmation",
      details: { confirmationCount: result.confirmations.length },
    });
    return result;
  }
  // Validate both logical transitions even though persistence uses one guarded write.
  transitionForReconciliation("EVIDENCE_CAPTURED", result);
  const nextStatus = result.caseState;
  const { data: updated, error: updateError } = await admin.from("cases")
    .update({
      status: nextStatus,
      discrepancies: discrepancySchema.array().parse(result.discrepancies),
      potential_recovery_paise: result.totalPotentialRecoveryPaise,
      outstanding_paise: result.totalPotentialRecoveryPaise,
      updated_at: new Date().toISOString(),
    })
    .eq("id", caseId).eq("user_id", userId).eq("status", "EVIDENCE_CAPTURED")
    .select("id").maybeSingle();
  if (updateError) throw updateError;
  if (!updated) throw new CaseReconciliationError("Case changed during reconciliation; retry");
  await appendCaseEvent(admin, {
    caseId, userId, eventType: "case_reconciled",
    summary: result.outcome === "clean" ? result.message : `${result.discrepancies.length} discrepancies found`,
    details: {
      discrepancyCount: result.discrepancies.length,
      potentialRecoveryPaise: result.totalPotentialRecoveryPaise,
    },
  });
  return result;
}
