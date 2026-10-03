import "server-only";
import { z } from "zod";
import { requireMerchant } from "../auth/session";
import { assertCaseOwnership } from "../auth/case-access";
import { createAdminClient } from "../supabase/admin";
import { downloadEvidence } from "../storage/evidence";
import { appendCaseEvent } from "../cases/events";
import { extractRecoveryEvidence, recoveryEvidenceSchema } from "./evidence";
import { planRecoveryAllocation } from "./allocation";

const requestSchema = z.object({
  caseId: z.uuid(),
  artifactId: z.uuid(),
  obligationIds: z.array(z.uuid()).max(20).optional(),
  merchantConfirmedLink: z.boolean().optional(),
});
const obligationRowSchema = z.object({
  id: z.uuid(),
  original_amount_paise: z.number().int().positive().safe(),
  recovered_paise: z.number().int().nonnegative().safe(),
  outstanding_paise: z.number().int().nonnegative().safe(),
});
const verificationSchema = z.object({
  artifactId: z.uuid(), caseId: z.uuid(),
  creditPaise: z.number().int().nonnegative().safe(),
  appliedPaise: z.number().int().nonnegative().safe(),
  outstandingPaise: z.number().int().nonnegative().safe(),
  caseState: z.string(), outcome: z.enum(["missing", "partial", "full"]),
  alreadyApplied: z.boolean(),
});

export class RecoveryVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RecoveryVerificationError";
  }
}

async function persistExtraction(artifactId: string, caseId: string, userId: string,
  result: Awaited<ReturnType<typeof extractRecoveryEvidence>>) {
  const admin = createAdminClient();
  const status = result.status === "ready" ? "complete"
    : result.status === "needs_confirmation" ? "needs_confirmation" : "failed";
  const { error } = await admin.from("artifacts")
    .update({ extracted: result.status === "error" ? null : result, extraction_status: status })
    .eq("id", artifactId).eq("case_id", caseId).eq("user_id", userId);
  if (error) throw error;
}

async function alreadyVerified(artifactId: string, caseId: string, userId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin.from("recovery_verifications")
    .select("artifact_id, credit_paise, applied_paise, outcome, evidence")
    .eq("artifact_id", artifactId).eq("case_id", caseId).eq("user_id", userId).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const { data: caseRow, error: caseError } = await admin.from("cases")
    .select("status, outstanding_paise").eq("id", caseId).eq("user_id", userId).single();
  if (caseError) throw caseError;
  return {
    status: "verified" as const,
    evidence: recoveryEvidenceSchema.parse(data.evidence),
    verification: verificationSchema.parse({
      artifactId, caseId, creditPaise: Number(data.credit_paise),
      appliedPaise: Number(data.applied_paise), outstandingPaise: Number(caseRow.outstanding_paise),
      caseState: caseRow.status, outcome: data.outcome, alreadyApplied: true,
    }),
  };
}

/** Verify a new credit artifact once; a supplier promise is never accepted as recovery. */
export async function verifyRecovery(input: z.input<typeof requestSchema>) {
  const parsed = requestSchema.parse(input);
  if (parsed.obligationIds && new Set(parsed.obligationIds).size !== parsed.obligationIds.length) {
    throw new RecoveryVerificationError("Select each obligation only once");
  }
  const { supabase, userId } = await requireMerchant();
  await assertCaseOwnership(supabase, parsed.caseId, userId);
  const artifact = await downloadEvidence({ caseId: parsed.caseId, artifactId: parsed.artifactId });
  if (!["credit_note", "corrected_invoice"].includes(artifact.type)) {
    throw new RecoveryVerificationError("Upload a credit note or later invoice for recovery verification");
  }
  const prior = await alreadyVerified(parsed.artifactId, parsed.caseId, userId);
  if (prior) return prior;

  const extracted = await extractRecoveryEvidence({
    artifactId: artifact.artifactId, label: artifact.label,
    mimeType: artifact.mimeType, bytes: new Uint8Array(artifact.bytes), text: artifact.text,
  });
  await persistExtraction(parsed.artifactId, parsed.caseId, userId, extracted);
  if (extracted.status !== "ready") {
    if (extracted.status === "needs_confirmation") {
      await appendCaseEvent(createAdminClient(), {
        caseId: parsed.caseId, userId, eventType: "recovery_evidence_needs_confirmation",
        summary: "Recovery evidence needs confirmation before credit can be counted",
        status: "needs_confirmation",
      });
    }
    return extracted;
  }
  const { data: invoiceRows, error: invoiceError } = await createAdminClient().from("artifacts")
    .select("extracted").eq("case_id", parsed.caseId).eq("user_id", userId)
    .eq("type", "invoice").eq("extraction_status", "complete");
  if (invoiceError) throw invoiceError;
  const invoiceNumbers = (invoiceRows ?? []).flatMap((row) => {
    const candidate = z.object({ status: z.literal("ready"), facts: z.object({ invoiceNumber: z.string().min(1).nullable() }) })
      .safeParse(row.extracted);
    return candidate.success && candidate.data.facts.invoiceNumber
      ? [candidate.data.facts.invoiceNumber] : [];
  });
  const evidenceText = [artifact.text, extracted.evidence.referenceText,
    extracted.evidence.source.excerpt].filter((value): value is string => Boolean(value)).join("\n").toLowerCase();
  const matchedInvoice = invoiceNumbers.find((number) => evidenceText.includes(number.toLowerCase())) ?? null;
  if (!matchedInvoice && parsed.merchantConfirmedLink !== true) {
    return { status: "needs_confirmation" as const, evidence: extracted.evidence,
      confirmations: ["Confirm that this later document belongs to the original claimed invoice"] };
  }
  const creditPaise = extracted.evidence.explicitAmountPaise ?? 0;
  const admin = createAdminClient();
  const { data: rows, error } = await admin.from("recovery_obligations")
    .select("id, original_amount_paise, recovered_paise, outstanding_paise")
    .eq("case_id", parsed.caseId).eq("user_id", userId)
    .gt("outstanding_paise", 0)
    .order("created_at", { ascending: true }).order("id", { ascending: true });
  if (error) throw error;
  const open = obligationRowSchema.array().parse(rows ?? []);
  const selected = parsed.obligationIds
    ? open.filter((row) => parsed.obligationIds!.includes(row.id))
    : creditPaise > 0 && open.length === 1 ? open : creditPaise === 0 ? [] : [];
  if (creditPaise > 0 && open.length === 0) {
    return { status: "needs_confirmation" as const, evidence: extracted.evidence,
      confirmations: ["No open supplier obligation matches this credit"] };
  }
  if (creditPaise > 0 && !parsed.obligationIds && open.length > 1) {
    return { status: "needs_confirmation" as const, evidence: extracted.evidence,
      confirmations: ["Select the supplier obligation or obligations shown on this credit evidence"],
      obligationIds: open.map((row) => row.id) };
  }
  if (creditPaise > 0 && parsed.obligationIds?.length === 0) {
    throw new RecoveryVerificationError("Select at least one open obligation for this credit");
  }
  if (parsed.obligationIds && selected.length !== parsed.obligationIds.length) {
    throw new RecoveryVerificationError("Selected obligation is not open on this case");
  }
  const plan = planRecoveryAllocation({
    creditPaise,
    obligations: selected.map((row) => ({
      id: row.id, originalAmountPaise: row.original_amount_paise,
      recoveredPaise: row.recovered_paise, outstandingPaise: row.outstanding_paise,
    })),
  });
  const allocations = plan.allocations.map((allocation) => ({
    id: allocation.id,
    expectedOutstandingPaise: selected.find((row) => row.id === allocation.id)!.outstanding_paise,
    appliedPaise: allocation.appliedPaise,
  }));
  const { data: result, error: rpcError } = await admin.rpc("apply_recovery_verification", {
    p_user_id: userId,
    p_case_id: parsed.caseId,
    p_artifact_id: parsed.artifactId,
    p_credit_paise: creditPaise,
    p_evidence: {
      ...extracted.evidence,
      linkage: matchedInvoice
        ? { originalInvoiceNumber: matchedInvoice, method: "document_reference" }
        : { method: "merchant_confirmation", confirmedAt: new Date().toISOString() },
    },
    p_allocations: allocations,
  });
  if (rpcError) throw rpcError;
  return { status: "verified" as const, evidence: extracted.evidence,
    verification: verificationSchema.parse(result), allocation: plan };
}
