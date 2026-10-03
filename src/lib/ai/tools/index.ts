import "server-only";
import { tool } from "ai";
import { z } from "zod";
import { requireMerchant } from "../../auth/session";
import { assertCaseOwnership } from "../../auth/case-access";
import { createAdminClient } from "../../supabase/admin";
import { appendCaseEvent } from "../../cases/events";
import { CaseReconciliationError, inspectCase, reconcileStoredCase } from "../../cases/reconcile";
import { ClaimOperationError, createDraftClaim, sendSupplierMessage } from "../../claims/operations";
import { prepareSupplierFollowup, SupplierFollowupError } from "../../claims/followup-message";
import { verifyRecovery } from "../../recovery/verify";
import { followupReasonSchema, scheduleCaseFollowup, FollowupScheduleError } from "../../followup/schedule";

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
    const message = error instanceof ClaimOperationError || error instanceof CaseReconciliationError || error instanceof FollowupScheduleError || error instanceof SupplierFollowupError
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
      description: "Run the first deterministic reconciliation only while the case is EVIDENCE_CAPTURED. For an already reconciled case, return its persisted result without changing it. Never provide monetary inputs.",
      inputSchema: z.object({}),
      execute: async () => {
        const inspection = await runCaseTool(context, "inspect_case", () => inspectCase(context.caseId));
        if (!inspection.ok) return inspection;
        if (inspection.result.status !== "EVIDENCE_CAPTURED") {
          return {
            ok: true as const,
            result: {
              action: inspection.result.status === "DRAFT" ? "await_evidence" as const : "already_reconciled" as const,
              case: inspection.result,
            },
          };
        }
        return runCaseTool(context, "reconcile_case", () => reconcileStoredCase(context.caseId));
      },
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
    prepareSupplierFollowup: tool({
      description: "Prepare an evidence-backed correction after a supplier has rejected a claim item. This creates an unsent draft for the merchant to review. Never approve or send it yourself.",
      inputSchema: z.object({}),
      execute: () => runCaseTool(context, "prepare_supplier_followup", () => prepareSupplierFollowup(context.caseId)),
    }),
    verifyRecovery: tool({
      description: "Check a newly uploaded credit note or later invoice against open obligations. Supplier promises alone never count as recovered. A merchant may need to select obligations when several are open.",
      inputSchema: z.object({ artifactId: z.uuid(), obligationIds: z.array(z.uuid()).max(20).optional() }),
      execute: ({ artifactId, obligationIds }) => runCaseTool(context, "verify_recovery",
        () => verifyRecovery({ caseId: context.caseId, artifactId, obligationIds })),
    }),
    scheduleFollowup: tool({
      description: "Schedule a reminder for a sent claim with outstanding recovery. This never changes recovered money or case state. Use only when a supplier response or promised credit needs a later check.",
      inputSchema: z.object({ delayHours: z.number().int().min(1).max(24 * 30), reason: followupReasonSchema }),
      execute: ({ delayHours, reason }) => runCaseTool(context, "schedule_followup",
        () => scheduleCaseFollowup(context.caseId, {
          scheduledFor: new Date(Date.now() + delayHours * 60 * 60 * 1000).toISOString(), reason,
        })),
    }),
  };
}
