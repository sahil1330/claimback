import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { assertCaseOwnership, CaseAccessError } from "../auth/case-access";
import { requireMerchant } from "../auth/session";
import { appendCaseEvent } from "../cases/events";
import { isCaseState, transitionCaseState, type CaseState } from "../cases/state";
import { createAdminClient } from "../supabase/admin";
import { discrepancySchema, type Discrepancy, type SourceEvidence } from "../../types/domain";

const caseRowSchema = z.object({
  id: z.uuid(),
  user_id: z.uuid(),
  status: z.string(),
  discrepancies: z.unknown(),
  potential_recovery_paise: z.number().int().nonnegative().safe(),
  merchant_approved_at: z.string().nullable(),
  claim_sent_at: z.string().nullable(),
});

type CaseRow = z.infer<typeof caseRowSchema>;

export class ClaimOperationError extends Error {
  constructor(
    readonly code: "INVALID_STATE" | "INVALID_EVIDENCE" | "NOT_APPROVED",
    message: string,
  ) {
    super(message);
    this.name = "ClaimOperationError";
  }
}

export type DraftClaim = {
  caseId: string;
  body: string;
  totalPotentialRecoveryPaise: number;
  discrepancies: Discrepancy[];
  evidence: SourceEvidence[];
  status: "awaiting_approval" | "approved" | "sent";
};

function caseState(row: CaseRow): CaseState {
  if (!isCaseState(row.status)) {
    throw new ClaimOperationError("INVALID_STATE", "Case has an unknown state");
  }
  return row.status;
}

function formatPaise(paise: number): string {
  const amount = BigInt(paise);
  const rupees = amount / BigInt(100);
  const remainder = (amount % BigInt(100)).toString().padStart(2, "0");
  return `₹${rupees}.${remainder}`;
}

function evidenceFrom(discrepancies: Discrepancy[]): SourceEvidence[] {
  const evidence = new Map<string, SourceEvidence>();
  for (const item of discrepancies) {
    for (const source of [item.promisedEvidence, item.billedEvidence, item.receivedEvidence]) {
      evidence.set(`${source.sourceArtifactId}:${source.locator ?? ""}:${source.excerpt ?? ""}`, source);
    }
  }
  return [...evidence.values()];
}

/** Build supplier-facing text only from persisted, sourced, deterministic discrepancies. */
export function draftClaimFromPersistedCase(row: CaseRow): DraftClaim {
  const state = caseState(row);
  if (state === "NO_DISCREPANCY") {
    throw new ClaimOperationError("INVALID_STATE", "A clean delivery does not need a claim");
  }
  if (!["DISCREPANCY_FOUND", "AWAITING_MERCHANT_APPROVAL", "CLAIM_SENT", "AWAITING_SUPPLIER", "SUPPLIER_RESPONDED", "AWAITING_RECOVERY", "RECOVERY_VERIFICATION", "RESOLVED", "ESCALATED"].includes(state)) {
    throw new ClaimOperationError("INVALID_STATE", "Reconcile the case before drafting a claim");
  }
  const parsed = z.array(discrepancySchema).min(1).safeParse(row.discrepancies);
  if (!parsed.success) {
    throw new ClaimOperationError("INVALID_EVIDENCE", "The case has no complete, sourced discrepancy evidence");
  }
  const discrepancies = parsed.data;
  const calculatedTotal = discrepancies.reduce((total, item) => total + BigInt(item.amountPaise), BigInt(0));
  if (calculatedTotal !== BigInt(row.potential_recovery_paise) || calculatedTotal > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new ClaimOperationError("INVALID_EVIDENCE", "Persisted discrepancy amounts do not match the case total");
  }
  const evidence = evidenceFrom(discrepancies);
  if (evidence.some((source) => !source.excerpt && !source.locator)) {
    throw new ClaimOperationError("INVALID_EVIDENCE", "A discrepancy is missing its evidence location");
  }
  const lines = discrepancies.map((item, index) =>
    `${index + 1}. ${item.description}: ${formatPaise(item.amountPaise)}. ` +
    `Promise: ${item.promisedEvidence.sourceLabel}; invoice: ${item.billedEvidence.sourceLabel}; ` +
    `receiving: ${item.receivedEvidence.sourceLabel}.`,
  );
  const body = [
    "Please review these delivery differences and arrange a credit or replacement:",
    ...lines,
    `Total requested: ${formatPaise(row.potential_recovery_paise)}.`,
    "Please confirm how and when you will resolve each item.",
  ].join("\n");
  return {
    caseId: row.id,
    body,
    totalPotentialRecoveryPaise: row.potential_recovery_paise,
    discrepancies,
    evidence,
    status: row.claim_sent_at ? "sent" : row.merchant_approved_at ? "approved" : "awaiting_approval",
  };
}

async function ownedContext(caseId: string) {
  z.uuid().parse(caseId);
  const { supabase, userId } = await requireMerchant();
  await assertCaseOwnership(supabase, caseId, userId);
  return { admin: createAdminClient(), userId };
}

async function loadCase(admin: SupabaseClient, caseId: string, userId: string): Promise<CaseRow> {
  const { data, error } = await admin.from("cases")
    .select("id, user_id, status, discrepancies, potential_recovery_paise, merchant_approved_at, claim_sent_at")
    .eq("id", caseId).eq("user_id", userId).maybeSingle();
  if (error) throw error;
  if (!data) throw new CaseAccessError();
  return caseRowSchema.parse(data);
}

/** Create an evidence packet and enter the approval state. This never contacts a supplier. */
export async function createDraftClaim(caseId: string): Promise<DraftClaim> {
  const { admin, userId } = await ownedContext(caseId);
  const row = await loadCase(admin, caseId, userId);
  const draft = draftClaimFromPersistedCase(row);
  if (caseState(row) !== "DISCREPANCY_FOUND") return draft;

  const next = transitionCaseState("DISCREPANCY_FOUND", "AWAITING_MERCHANT_APPROVAL");
  const { data, error } = await admin.from("cases")
    .update({ status: next, updated_at: new Date().toISOString() })
    .eq("id", caseId).eq("user_id", userId).eq("status", "DISCREPANCY_FOUND")
    .select("id").maybeSingle();
  if (error) throw error;
  if (!data) return draftClaimFromPersistedCase(await loadCase(admin, caseId, userId));

  await appendCaseEvent(admin, {
    caseId, userId, eventType: "claim_drafted", summary: "Evidence packet created",
    details: { discrepancyCount: draft.discrepancies.length, totalPotentialRecoveryPaise: draft.totalPotentialRecoveryPaise },
  });
  await appendCaseEvent(admin, {
    caseId, userId, eventType: "merchant_approval_pending", summary: "Waiting for merchant approval",
  });
  return draft;
}

export type ClaimApproval = {
  caseId: string;
  merchantApprovedAt: string;
  status: "approved" | "already_approved";
};

/** Record an authenticated merchant action; model output cannot approve a claim. */
export async function approveClaim(caseId: string): Promise<ClaimApproval> {
  const { admin, userId } = await ownedContext(caseId);
  const row = await loadCase(admin, caseId, userId);
  draftClaimFromPersistedCase(row);
  if (row.merchant_approved_at && caseState(row) !== "DISCREPANCY_FOUND") {
    return { caseId, merchantApprovedAt: row.merchant_approved_at, status: "already_approved" };
  }
  if (caseState(row) !== "AWAITING_MERCHANT_APPROVAL") {
    throw new ClaimOperationError("INVALID_STATE", "Claim must be awaiting merchant approval");
  }
  if (row.merchant_approved_at) {
    return { caseId, merchantApprovedAt: row.merchant_approved_at, status: "already_approved" };
  }
  const approvedAt = new Date().toISOString();
  const { data, error } = await admin.from("cases")
    .update({ merchant_approved_at: approvedAt, updated_at: approvedAt })
    .eq("id", caseId).eq("user_id", userId).eq("status", "AWAITING_MERCHANT_APPROVAL")
    .is("merchant_approved_at", null).select("merchant_approved_at").maybeSingle();
  if (error) throw error;
  if (!data) {
    const current = await loadCase(admin, caseId, userId);
    if (caseState(current) === "AWAITING_MERCHANT_APPROVAL" && current.merchant_approved_at) {
      return { caseId, merchantApprovedAt: current.merchant_approved_at, status: "already_approved" };
    }
    throw new ClaimOperationError("INVALID_STATE", "Claim changed before approval was recorded");
  }
  await appendCaseEvent(admin, {
    caseId, userId, eventType: "merchant_approved", summary: "Merchant approved the claim",
  });
  return { caseId, merchantApprovedAt: data.merchant_approved_at as string, status: "approved" };
}

export type SupplierSend = {
  caseId: string;
  messageId: string;
  caseState: CaseState;
  status: "sent" | "already_sent";
};

async function existingInitialMessage(admin: SupabaseClient, caseId: string, userId: string): Promise<boolean> {
  const { data, error } = await admin.from("supplier_messages")
    .select("id").eq("id", caseId).eq("case_id", caseId).eq("user_id", userId).maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

async function markClaimSent(admin: SupabaseClient, caseId: string, userId: string, approvedAt: string) {
  const next = transitionCaseState("AWAITING_MERCHANT_APPROVAL", "CLAIM_SENT", { merchantApprovedAt: approvedAt });
  const sentAt = new Date().toISOString();
  const { data, error } = await admin.from("cases")
    .update({ status: next, claim_sent_at: sentAt, updated_at: sentAt })
    .eq("id", caseId).eq("user_id", userId).eq("status", "AWAITING_MERCHANT_APPROVAL")
    .not("merchant_approved_at", "is", null).is("claim_sent_at", null)
    .select("id").maybeSingle();
  if (error) throw error;
  if (data) {
    await appendCaseEvent(admin, { caseId, userId, eventType: "claim_sent", summary: "Claim sent to supplier" });
    return next;
  }
  const current = await loadCase(admin, caseId, userId);
  if (current.claim_sent_at) return caseState(current);
  throw new ClaimOperationError("INVALID_STATE", "Claim changed before its send could be recorded");
}

/** Send the first claim once through the durable demo transport record. */
export async function sendSupplierMessage(caseId: string): Promise<SupplierSend> {
  const { admin, userId } = await ownedContext(caseId);
  const row = await loadCase(admin, caseId, userId);
  if (!row.merchant_approved_at) {
    throw new ClaimOperationError("NOT_APPROVED", "Merchant approval must be recorded before sending");
  }
  const state = caseState(row);
  const exists = await existingInitialMessage(admin, caseId, userId);
  if (exists) {
    const finalState = state === "AWAITING_MERCHANT_APPROVAL"
      ? await markClaimSent(admin, caseId, userId, row.merchant_approved_at)
      : state;
    return { caseId, messageId: caseId, caseState: finalState, status: "already_sent" };
  }
  if (state !== "AWAITING_MERCHANT_APPROVAL") {
    throw new ClaimOperationError("INVALID_STATE", "Claim must be awaiting approval before sending");
  }
  const draft = draftClaimFromPersistedCase(row);
  const { error } = await admin.from("supplier_messages").insert({
    id: caseId,
    case_id: caseId,
    user_id: userId,
    direction: "outbound",
    body: draft.body,
    source: "demo_claim_transport",
  });
  if (error && error.code !== "23505") throw error;
  if (error && !(await existingInitialMessage(admin, caseId, userId))) throw error;
  const finalState = await markClaimSent(admin, caseId, userId, row.merchant_approved_at);
  return { caseId, messageId: caseId, caseState: finalState, status: error ? "already_sent" : "sent" };
}
