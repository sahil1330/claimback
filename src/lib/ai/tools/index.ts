import "server-only";
import { tool } from "ai";
import { z } from "zod";
import { requireMerchant } from "../../auth/session";
import { assertCaseOwnership } from "../../auth/case-access";
import { createAdminClient } from "../../supabase/admin";
import { appendCaseEvent } from "../../cases/events";
import { CaseReconciliationError, inspectCase, reconcileStoredCase } from "../../cases/reconcile";
import { ClaimOperationError, createDraftClaim, sendSupplierMessage } from "../../claims/operations";

type ToolContext = { caseId: string; userId: string };

async function runCaseTool<T>(context: ToolContext, name: string, action: () => Promise<T>) {
  const { supabase, userId } = await requireMerchant();
  if (userId !== context.userId) throw new Error("Merchant session changed");
  await assertCaseOwnership(supabase, context.caseId, userId);
  const admin = createAdminClient();
  try {
    const result = await action();
    await appendCaseEvent(admin, {
      caseId: context.caseId, userId, eventType: `agent_${name}`,
      summary: `Agent ${name.replaceAll("_", " ")} completed`,
    });
    return { ok: true as const, result };
  } catch (error) {
    const message = error instanceof ClaimOperationError || error instanceof CaseReconciliationError
      ? error.message
      : "This step could not be completed. Please retry or review the case evidence.";
    await appendCaseEvent(admin, {
      caseId: context.caseId, userId, eventType: `agent_${name}`,
      summary: `Agent ${name.replaceAll("_", " ")} needs attention`,
      status: "error",
    });
    return { ok: false as const, error: message };
  }
}

/** Case-scoped tools have no parameters that can set money, approval, or state. */
export function createAgentTools(context: ToolContext) {
  return {
    inspectCase: tool({
      description: "Read this merchant's current case facts, state, discrepancies, and approval status before taking action.",
      inputSchema: z.object({}),
      execute: () => runCaseTool(context, "inspect_case", () => inspectCase(context.caseId)),
    }),
    reconcileCase: tool({
      description: "Reconcile stored, merchant-confirmed invoice, agreement, and receiving facts with deterministic code. Never provide monetary inputs.",
      inputSchema: z.object({}),
      execute: () => runCaseTool(context, "reconcile_case", () => reconcileStoredCase(context.caseId)),
    }),
    createClaim: tool({
      description: "Build an evidence-grounded draft claim from persisted discrepancies and wait for merchant approval.",
      inputSchema: z.object({}),
      execute: () => runCaseTool(context, "create_claim", () => createDraftClaim(context.caseId)),
    }),
    sendSupplierMessage: tool({
      description: "Send the draft through the demo transport only if merchant approval was recorded by the authenticated approval action.",
      inputSchema: z.object({}),
      execute: () => runCaseTool(context, "send_supplier_message", () => sendSupplierMessage(context.caseId)),
    }),
  };
}
