import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { requireMerchant } from "../auth/session";
import { assertCaseOwnership } from "../auth/case-access";
import { createAdminClient } from "../supabase/admin";
import { appendCaseEvent } from "../cases/events";
import { supplierResponseSchema } from "../ai/supplier-response";
import { discrepancySchema, type Discrepancy } from "../../types/domain";

const draftSource = "demo_followup_draft";
const sentSource = "demo_followup_transport";
const caseSchema = z.object({
  status: z.string(), claim_sent_at: z.string().nullable(), discrepancies: z.array(discrepancySchema),
});
const responseSchema = z.object({
  id: z.uuid(), body: z.string(), parsed: z.object({
    analysis: supplierResponseSchema, appliedAt: z.string().nullable(),
  }),
});
const draftMetadataSchema = z.object({
  kind: z.literal("supplier_followup"), responseMessageId: z.uuid(),
  discrepancyIds: z.array(z.string()).min(1), merchantApprovedAt: z.string().nullable(),
});
const draftRowSchema = z.object({
  id: z.uuid(), body: z.string(), source: z.string(), parsed: draftMetadataSchema,
});

export class SupplierFollowupError extends Error {
  constructor(message: string) { super(message); this.name = "SupplierFollowupError"; }
}

export function followupId(caseId: string, responseMessageId: string) {
  const hex = createHash("sha256").update(`claimback:followup:${caseId}:${responseMessageId}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function paise(value: number) {
  const amount = BigInt(value);
  return `₹${amount / BigInt(100)}.${(amount % BigInt(100)).toString().padStart(2, "0")}`;
}

function sourceProof(label: string, excerpt: string | null) {
  const quote = excerpt?.replace(/\s+/g, " ").trim().slice(0, 220);
  return quote ? `${label} (“${quote}”)` : label;
}

/** Supplier-facing correction uses only the rejected, persisted claim items. */
export function buildSupplierFollowup(items: Discrepancy[]) {
  const lines = items.map((item, index) => {
    const rates = item.type === "RATE_MISMATCH"
      ? ` Agreed rate: ${paise(item.expectedUnitPricePaise)}; billed rate: ${paise(item.billedUnitPricePaise)}; affected units: ${item.affectedQuantity}.`
      : "";
    return `${index + 1}. ${item.description} (${item.skuRef}): ${paise(item.amountPaise)}.${rates} ` +
      `Agreement proof: ${sourceProof(item.promisedEvidence.sourceLabel, item.promisedEvidence.excerpt)}; ` +
      `invoice proof: ${sourceProof(item.billedEvidence.sourceLabel, item.billedEvidence.excerpt)}; ` +
      `receiving proof: ${sourceProof(item.receivedEvidence.sourceLabel, item.receivedEvidence.excerpt)}.`;
  });
  return [
    "Please recheck the disputed items in your reply:",
    ...lines,
    "These differences are supported by the original agreement, invoice and confirmed receiving record. Please send a corrected response or credit note for the items above. We will verify any credit or replacement against later evidence.",
  ].join("\n");
}

async function ownedContext(caseId: string) {
  z.uuid().parse(caseId);
  const { supabase, userId } = await requireMerchant();
  await assertCaseOwnership(supabase, caseId, userId);
  return { admin: createAdminClient(), userId };
}

async function latestResponse(admin: ReturnType<typeof createAdminClient>, caseId: string, userId: string) {
  const { data, error } = await admin.from("supplier_messages")
    .select("id,body,parsed").eq("case_id", caseId).eq("user_id", userId)
    .eq("direction", "inbound").like("source", "demo_supplier:%")
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  if (!data) throw new SupplierFollowupError("Wait for a supplier reply before preparing a correction");
  const parsed = responseSchema.safeParse(data);
  if (!parsed.success || !parsed.data.parsed.appliedAt) {
    throw new SupplierFollowupError("The supplier reply is still being checked; retry shortly");
  }
  return parsed.data;
}

async function loadDraft(admin: ReturnType<typeof createAdminClient>, caseId: string, userId: string, id: string) {
  const { data, error } = await admin.from("supplier_messages")
    .select("id,body,source,parsed").eq("id", id).eq("case_id", caseId)
    .eq("user_id", userId).eq("direction", "outbound").maybeSingle();
  if (error) throw error;
  return data ? draftRowSchema.parse(data) : null;
}

export async function getSupplierFollowup(caseId: string) {
  const { admin, userId } = await ownedContext(caseId);
  const { data, error } = await admin.from("supplier_messages")
    .select("id,body,source,parsed").eq("case_id", caseId).eq("user_id", userId)
    .eq("direction", "outbound").in("source", [draftSource, sentSource])
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = draftRowSchema.parse(data);
  return { id: row.id, body: row.body, status: row.source === sentSource ? "sent" as const : "awaiting_approval" as const };
}

export async function prepareSupplierFollowup(caseId: string) {
  const { admin, userId } = await ownedContext(caseId);
  const { data, error } = await admin.from("cases")
    .select("status,claim_sent_at,discrepancies").eq("id", caseId).eq("user_id", userId).single();
  if (error) throw error;
  const claim = caseSchema.parse(data);
  if (!claim.claim_sent_at || !["SUPPLIER_RESPONDED", "AWAITING_RECOVERY", "ESCALATED"].includes(claim.status)) {
    throw new SupplierFollowupError("Send the approved claim and check the supplier reply first");
  }
  const response = await latestResponse(admin, caseId, userId);
  const rejected = response.parsed.analysis.decisions
    .filter((decision) => decision.outcome === "rejected")
    .flatMap((decision) => claim.discrepancies.filter((item) => item.id === decision.discrepancyId));
  if (!rejected.length) throw new SupplierFollowupError("This reply has no rejected claim item to correct");
  const id = followupId(caseId, response.id);
  const existing = await loadDraft(admin, caseId, userId, id);
  if (existing) return { id, body: existing.body, status: existing.source === sentSource ? "sent" as const : "awaiting_approval" as const };
  const body = buildSupplierFollowup(rejected);
  const { error: insertError } = await admin.from("supplier_messages").insert({
    id, case_id: caseId, user_id: userId, direction: "outbound", body, source: draftSource,
    parsed: { kind: "supplier_followup", responseMessageId: response.id,
      discrepancyIds: rejected.map((item) => item.id), merchantApprovedAt: null },
  });
  if (insertError && insertError.code !== "23505") throw insertError;
  if (!insertError) await appendCaseEvent(admin, {
    caseId, userId, eventType: "supplier_followup_drafted",
    summary: "Evidence-backed supplier correction prepared; waiting for merchant approval",
    details: { messageId: id, discrepancyCount: rejected.length },
  });
  const saved = await loadDraft(admin, caseId, userId, id);
  if (!saved) throw new SupplierFollowupError("Could not reload the supplier correction");
  return { id, body: saved.body, status: saved.source === sentSource ? "sent" as const : "awaiting_approval" as const };
}

/** The authenticated merchant approves this exact draft before the demo send. */
export async function approveAndSendSupplierFollowup(caseId: string, draftId: string) {
  z.uuid().parse(draftId);
  const { admin, userId } = await ownedContext(caseId);
  const { data: rawCase, error: caseError } = await admin.from("cases")
    .select("status").eq("id", caseId).eq("user_id", userId).single();
  if (caseError) throw caseError;
  const { status: caseStatus } = z.object({ status: z.string() }).parse(rawCase);
  if (["RESOLVED", "NO_DISCREPANCY"].includes(caseStatus)) {
    throw new SupplierFollowupError("This case is already closed; do not send a correction");
  }
  const row = await loadDraft(admin, caseId, userId, draftId);
  if (!row || ![draftSource, sentSource].includes(row.source)) throw new SupplierFollowupError("Supplier correction not found");
  if (row.source === sentSource) return { id: row.id, body: row.body, status: "already_sent" as const };
  const response = await latestResponse(admin, caseId, userId);
  if (response.id !== row.parsed.responseMessageId) {
    throw new SupplierFollowupError("A newer supplier reply arrived; review a fresh correction before sending");
  }
  const approvedAt = row.parsed.merchantApprovedAt ?? new Date().toISOString();
  if (!row.parsed.merchantApprovedAt) {
    const { data: approved, error } = await admin.from("supplier_messages")
      .update({ parsed: { ...row.parsed, merchantApprovedAt: approvedAt } })
      .eq("id", draftId).eq("case_id", caseId).eq("user_id", userId).eq("source", draftSource)
      .select("parsed").maybeSingle();
    if (error) throw error;
    if (!approved || !draftMetadataSchema.parse(approved.parsed).merchantApprovedAt) {
      throw new SupplierFollowupError("Approval could not be recorded; the correction was not sent");
    }
  }
  const { data, error } = await admin.from("supplier_messages")
    .update({ source: sentSource }).eq("id", draftId).eq("case_id", caseId)
    .eq("user_id", userId).eq("source", draftSource)
    .select("id").maybeSingle();
  if (error) throw error;
  if (!data) {
    const current = await loadDraft(admin, caseId, userId, draftId);
    if (current?.source === sentSource) return { id: row.id, body: row.body, status: "already_sent" as const };
    throw new SupplierFollowupError("Supplier correction changed; retry safely");
  }
  await appendCaseEvent(admin, {
    caseId, userId, eventType: "supplier_followup_sent",
    summary: "Merchant-approved correction sent through demo supplier transport",
    details: { messageId: draftId, responseMessageId: response.id },
  });
  return { id: row.id, body: row.body, status: "sent" as const };
}
