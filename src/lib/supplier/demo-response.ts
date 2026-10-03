import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireMerchant } from "../auth/session";
import { assertCaseOwnership } from "../auth/case-access";
import { createAdminClient } from "../supabase/admin";
import { discrepancySchema } from "../../types/domain";
import { addPaise } from "../reconciliation/money";
import { isCaseState, transitionCaseState, type CaseState } from "../cases/state";
import { appendCaseEvent } from "../cases/events";
import { simulateSupplierResponse } from "../demo/supplier-simulator";
import { supplierScenarioIdSchema, type SupplierScenarioId } from "../demo/scenarios";
import { parseSupplierResponse, supplierResponseSchema } from "../ai/supplier-response";

const caseRowSchema = z.object({
  id: z.uuid(), status: z.string(), supplier_id: z.uuid().nullable(),
  claim_sent_at: z.string().nullable(), discrepancies: z.unknown(),
});
const messageRowSchema = z.object({
  id: z.uuid(), body: z.string(), parsed: z.unknown().nullable(), source: z.string().nullable(),
});
const storedAnalysisSchema = z.object({
  scenarioId: supplierScenarioIdSchema,
  responseKind: z.string(),
  analysis: supplierResponseSchema,
  appliedAt: z.string().nullable(),
});

export class DemoResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DemoResponseError";
  }
}

function responseId(caseId: string, sequence: number) {
  const hex = createHash("sha256").update(`claimback:demo:${caseId}:${sequence}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

async function loadCase(admin: SupabaseClient, caseId: string, userId: string) {
  const { data, error } = await admin.from("cases")
    .select("id, status, supplier_id, claim_sent_at, discrepancies")
    .eq("id", caseId).eq("user_id", userId).single();
  if (error) throw error;
  const row = caseRowSchema.parse(data);
  if (!isCaseState(row.status)) throw new DemoResponseError("Case has an unknown state");
  return { ...row, status: row.status as CaseState, discrepancies: discrepancySchema.array().min(1).parse(row.discrepancies) };
}

async function setState(admin: SupabaseClient, caseId: string, userId: string, from: CaseState, to: CaseState) {
  if (from === to) return to;
  transitionCaseState(from, to);
  const { data, error } = await admin.from("cases")
    .update({ status: to, updated_at: new Date().toISOString() })
    .eq("id", caseId).eq("user_id", userId).eq("status", from)
    .select("id").maybeSingle();
  if (error) throw error;
  if (!data) throw new DemoResponseError("Case state changed; retry the supplier response");
  return to;
}

async function advanceForResponse(admin: SupabaseClient, caseId: string, userId: string, current: CaseState, acknowledgedPaise: number, allRejected: boolean) {
  let state = current;
  if (state === "CLAIM_SENT") state = await setState(admin, caseId, userId, state, "AWAITING_SUPPLIER");
  if (state === "AWAITING_SUPPLIER") state = await setState(admin, caseId, userId, state, "SUPPLIER_RESPONDED");
  if (state === "ESCALATED" && acknowledgedPaise > 0) state = await setState(admin, caseId, userId, state, "SUPPLIER_RESPONDED");
  if (acknowledgedPaise > 0 && state === "SUPPLIER_RESPONDED") state = await setState(admin, caseId, userId, state, "AWAITING_RECOVERY");
  if (allRejected && state === "SUPPLIER_RESPONDED") state = await setState(admin, caseId, userId, state, "ESCALATED");
  if (!["SUPPLIER_RESPONDED", "AWAITING_RECOVERY", "ESCALATED"].includes(state)) {
    throw new DemoResponseError("Case is not waiting for a supplier response");
  }
  return state;
}

async function saveObligation(admin: SupabaseClient, input: {
  caseId: string; userId: string; supplierId: string; messageId: string; amountPaise: number; promiseText: string; promisedFor: string | null;
}) {
  const { error } = await admin.from("recovery_obligations").insert({
    id: input.messageId,
    case_id: input.caseId,
    user_id: input.userId,
    supplier_id: input.supplierId,
    original_amount_paise: input.amountPaise,
    recovered_paise: 0,
    outstanding_paise: input.amountPaise,
    promise_text: input.promiseText,
    promised_for: input.promisedFor,
    status: "OPEN",
  });
  if (error && error.code !== "23505") throw error;
  if (error) {
    const { data, error: readError } = await admin.from("recovery_obligations")
      .select("id, original_amount_paise").eq("id", input.messageId)
      .eq("case_id", input.caseId).eq("user_id", input.userId).single();
    if (readError) throw readError;
    if (Number(data.original_amount_paise) !== input.amountPaise) {
      throw new DemoResponseError("A saved obligation differs from the supplier response");
    }
  }
}

/** Advance the deterministic demo transport; supplier commitments stay outstanding. */
export async function triggerDemoSupplierResponse(caseId: string, scenarioId: SupplierScenarioId) {
  z.uuid().parse(caseId);
  supplierScenarioIdSchema.parse(scenarioId);
  const { supabase, userId } = await requireMerchant();
  await assertCaseOwnership(supabase, caseId, userId);
  const admin = createAdminClient();
  const row = await loadCase(admin, caseId, userId);
  if (!row.claim_sent_at || !["CLAIM_SENT", "AWAITING_SUPPLIER", "SUPPLIER_RESPONDED", "AWAITING_RECOVERY", "ESCALATED"].includes(row.status)) {
    throw new DemoResponseError("Approve and send the claim before triggering a supplier response");
  }
  if (!row.supplier_id) throw new DemoResponseError("Add the supplier to this case before simulating a response");
  const { data: outbound, error: outboundError } = await admin.from("supplier_messages")
    .select("id").eq("id", caseId).eq("case_id", caseId).eq("user_id", userId)
    .eq("direction", "outbound").maybeSingle();
  if (outboundError) throw outboundError;
  if (!outbound) throw new DemoResponseError("The approved supplier message is missing");

  const { data: rawMessages, error: messagesError } = await admin.from("supplier_messages")
    .select("id, body, parsed, source").eq("case_id", caseId).eq("user_id", userId)
    .eq("direction", "inbound").like("source", "demo_supplier:%")
    .order("created_at", { ascending: true });
  if (messagesError) throw messagesError;
  const messages = messageRowSchema.array().parse(rawMessages ?? []);
  const existingScenario = messages[0]?.source?.split(":")[1];
  if (existingScenario && existingScenario !== scenarioId) {
    throw new DemoResponseError("This case already uses another supplier scenario");
  }
  const pendingIndex = messages.findIndex((message) => message.parsed === null ||
    storedAnalysisSchema.parse(message.parsed).appliedAt === null);
  const pending = pendingIndex >= 0 ? messages[pendingIndex] : null;
  const simulated = simulateSupplierResponse({
    scenarioId, caseId, claimMessageId: outbound.id,
    priorInboundCount: pending ? pendingIndex : messages.length, discrepancies: row.discrepancies,
  });
  if (pending && (!simulated || pending.body !== simulated.body)) {
    throw new DemoResponseError("Saved supplier response does not match the selected scenario");
  }
  if (!pending && !simulated) {
    const state = row.status === "CLAIM_SENT"
      ? await setState(admin, caseId, userId, "CLAIM_SENT", "AWAITING_SUPPLIER")
      : row.status;
    await appendCaseEvent(admin, {
      caseId, userId, eventType: "supplier_no_response",
      summary: "Waiting for supplier response; no credit has been verified",
    });
    return { caseId, scenarioId, response: null, caseState: state, acknowledgedPaise: 0 };
  }

  const message = pending ?? await (async () => {
    const id = responseId(caseId, messages.length);
    const { error } = await admin.from("supplier_messages").insert({
      id, case_id: caseId, user_id: userId,
      direction: "inbound", body: simulated!.body, source: `demo_supplier:${scenarioId}`,
    });
    if (error && error.code !== "23505") throw error;
    const { data, error: readError } = await admin.from("supplier_messages")
      .select("id, body, parsed, source").eq("id", id)
      .eq("case_id", caseId).eq("user_id", userId).single();
    if (readError) throw readError;
    return messageRowSchema.parse(data);
  })();

  let stored = message.parsed === null
    ? { scenarioId, responseKind: simulated!.responseKind, analysis: await parseSupplierResponse({
        messageId: message.id, body: message.body, discrepancies: row.discrepancies,
      }), appliedAt: null }
    : storedAnalysisSchema.parse(message.parsed);
  if (message.parsed === null) {
    const { data: saved, error } = await admin.from("supplier_messages")
      .update({ parsed: stored }).eq("id", message.id).eq("case_id", caseId)
      .eq("user_id", userId).is("parsed", null).select("parsed").maybeSingle();
    if (error) throw error;
    if (!saved) {
      const { data: winner, error: readError } = await admin.from("supplier_messages")
        .select("parsed").eq("id", message.id).eq("case_id", caseId)
        .eq("user_id", userId).single();
      if (readError) throw readError;
      stored = storedAnalysisSchema.parse(winner.parsed);
    }
  }
  const priorByDiscrepancy = new Map<string, number>();
  for (const priorMessage of messages) {
    if (priorMessage.id === message.id || priorMessage.parsed === null) continue;
    const prior = storedAnalysisSchema.parse(priorMessage.parsed);
    for (const decision of prior.analysis.decisions) {
      if (!["accepted", "promise_credit", "replacement"].includes(decision.outcome)) continue;
      priorByDiscrepancy.set(decision.discrepancyId,
        addPaise(priorByDiscrepancy.get(decision.discrepancyId) ?? 0, decision.supplierAcknowledgedPaise ?? 0));
    }
  }
  const newlyAcknowledged = stored.analysis.decisions.map((decision) => {
    if (!["accepted", "promise_credit", "replacement"].includes(decision.outcome)) return 0;
    const claimed = row.discrepancies.find((item) => item.id === decision.discrepancyId)!;
    const remaining = Math.max(0, claimed.amountPaise - (priorByDiscrepancy.get(decision.discrepancyId) ?? 0));
    return Math.min(remaining, decision.supplierAcknowledgedPaise ?? 0);
  });
  const acknowledgedPaise = addPaise(...newlyAcknowledged);
  if (acknowledgedPaise > 0) {
    const promisedFor = stored.analysis.decisions.find((decision) => decision.promisedForText)?.promisedForText ?? null;
    await saveObligation(admin, {
      caseId, userId, supplierId: row.supplier_id, messageId: message.id,
      amountPaise: acknowledgedPaise, promiseText: message.body, promisedFor,
    });
  }
  const allRejected = stored.analysis.decisions.every((decision) => decision.outcome === "rejected");
  const caseState = await advanceForResponse(admin, caseId, userId, row.status, acknowledgedPaise, allRejected);
  await appendCaseEvent(admin, {
    caseId, userId, eventType: "supplier_response_received",
    summary: "Supplier response received and checked against the claim",
    details: { responseMessageId: message.id, acknowledgedPaise },
  });
  if (acknowledgedPaise > 0) {
    await appendCaseEvent(admin, {
      caseId, userId, eventType: "supplier_promise_recorded",
      summary: "Supplier commitment recorded; recovery is still outstanding",
      details: { amountPaise: acknowledgedPaise },
    });
  }
  const { error: appliedError } = await admin.from("supplier_messages")
    .update({ parsed: { ...stored, appliedAt: new Date().toISOString() } })
    .eq("id", message.id).eq("case_id", caseId).eq("user_id", userId);
  if (appliedError) throw appliedError;
  return { caseId, scenarioId, responseMessageId: message.id, responseKind: stored.responseKind,
    response: stored.analysis, caseState, acknowledgedPaise };
}
