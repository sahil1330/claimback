import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("../../auth/session", () => ({ requireMerchant: vi.fn() }));
vi.mock("../../auth/case-access", () => ({ assertCaseOwnership: vi.fn() }));
vi.mock("../../supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("../../cases/events", () => ({ appendCaseEvent: vi.fn() }));
vi.mock("../../cases/reconcile", () => ({
  CaseReconciliationError: class extends Error {},
  inspectCase: vi.fn(),
  reconcileStoredCase: vi.fn(),
}));
vi.mock("../../claims/operations", () => ({
  ClaimOperationError: class extends Error {},
  createDraftClaim: vi.fn(),
  sendSupplierMessage: vi.fn(),
}));
vi.mock("../../recovery/verify", () => ({ verifyRecovery: vi.fn() }));
vi.mock("../../followup/schedule", async () => {
  const { z } = await import("zod");
  return {
    FollowupScheduleError: class extends Error {},
    followupReasonSchema: z.enum(["manual_review"]),
    scheduleCaseFollowup: vi.fn(),
  };
});

import { requireMerchant } from "../../auth/session";
import { assertCaseOwnership } from "../../auth/case-access";
import { createAdminClient } from "../../supabase/admin";
import { appendCaseEvent } from "../../cases/events";
import { inspectCase, reconcileStoredCase } from "../../cases/reconcile";
import { createAgentTools } from "./index";

const caseId = "5d5dc89e-aeeb-4afe-9b2e-dde126e7cece";
const userId = "f4cc15b4-8614-45ef-ab6b-ad7fb85beea3";

async function runReconcileTool() {
  const execute = createAgentTools({ caseId, userId }).reconcileCase.execute;
  if (!execute) throw new Error("Reconciliation tool has no executor");
  return execute({}, {} as Parameters<typeof execute>[1]);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireMerchant).mockResolvedValue({ supabase: {} as never, userId });
  vi.mocked(assertCaseOwnership).mockResolvedValue(undefined as never);
  vi.mocked(createAdminClient).mockReturnValue({} as never);
  vi.mocked(appendCaseEvent).mockResolvedValue(undefined as never);
});

describe("agent reconciliation tool", () => {
  it("reports a persisted result without rerunning reconciliation", async () => {
    const persisted = { id: caseId, status: "AWAITING_RECOVERY", potential_recovery_paise: 321800, outstanding_paise: 321800 };
    vi.mocked(inspectCase).mockResolvedValue(persisted as never);

    const result = await runReconcileTool();

    expect(result).toMatchObject({ ok: true, result: { action: "already_reconciled", case: persisted } });
    expect(reconcileStoredCase).not.toHaveBeenCalled();
    expect(appendCaseEvent).toHaveBeenCalledTimes(1);
  });

  it("reconciles merchant-confirmed evidence once", async () => {
    vi.mocked(inspectCase).mockResolvedValue({ id: caseId, status: "EVIDENCE_CAPTURED" } as never);
    vi.mocked(reconcileStoredCase).mockResolvedValue({ outcome: "discrepancies", totalPotentialRecoveryPaise: 321800 } as never);

    const result = await runReconcileTool();

    expect(result).toMatchObject({ ok: true, result: { outcome: "discrepancies", totalPotentialRecoveryPaise: 321800 } });
    expect(reconcileStoredCase).toHaveBeenCalledExactlyOnceWith(caseId);
  });

  it("does not reconcile a draft case", async () => {
    vi.mocked(inspectCase).mockResolvedValue({ id: caseId, status: "DRAFT" } as never);

    const result = await runReconcileTool();

    expect(result).toMatchObject({ ok: true, result: { action: "await_evidence" } });
    expect(reconcileStoredCase).not.toHaveBeenCalled();
  });
});
