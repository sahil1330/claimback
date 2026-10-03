import { describe, expect, it } from "vitest";
import {
  canTransitionCaseState,
  CASE_STATES,
  CaseTransitionError,
  isCaseState,
  transitionCaseState,
  type CaseState,
} from "./state";

describe("case state transitions", () => {
  it("allows the documented golden path and a confirmed clean delivery", () => {
    const path: CaseState[] = [
      "DRAFT",
      "EVIDENCE_CAPTURED",
      "RECONCILED",
      "DISCREPANCY_FOUND",
      "AWAITING_MERCHANT_APPROVAL",
      "CLAIM_SENT",
      "AWAITING_SUPPLIER",
      "SUPPLIER_RESPONDED",
      "AWAITING_RECOVERY",
      "RECOVERY_VERIFICATION",
      "RESOLVED",
    ];
    const context = {
      factsConfirmed: true,
      discrepancyCount: 1,
      merchantApprovedAt: "2026-10-03T08:00:00Z",
      recoveryVerified: true,
      outstandingPaise: 0,
    };

    for (let index = 1; index < path.length; index += 1) {
      expect(transitionCaseState(path[index - 1]!, path[index]!, context)).toBe(path[index]);
    }
    expect(transitionCaseState("RECONCILED", "NO_DISCREPANCY", {
      factsConfirmed: true,
      discrepancyCount: 0,
    })).toBe("NO_DISCREPANCY");
    expect(canTransitionCaseState("NO_DISCREPANCY", "AWAITING_MERCHANT_APPROVAL")).toBe(false);
  });

  it("rejects unapproved claim sending (T6)", () => {
    expect(() => transitionCaseState("AWAITING_MERCHANT_APPROVAL", "CLAIM_SENT", {
      merchantApprovedAt: null,
    })).toThrow(CaseTransitionError);
    expect(canTransitionCaseState("AWAITING_MERCHANT_APPROVAL", "CLAIM_SENT", {
      merchantApprovedAt: "  ",
    })).toBe(false);
  });

  it("keeps supplier promises open until actual recovery is verified (T7–T9)", () => {
    expect(canTransitionCaseState("SUPPLIER_RESPONDED", "RESOLVED", {
      recoveryVerified: true,
      outstandingPaise: 0,
    })).toBe(false);
    expect(canTransitionCaseState("SUPPLIER_RESPONDED", "AWAITING_RECOVERY")).toBe(true);
    expect(canTransitionCaseState("RECOVERY_VERIFICATION", "RESOLVED", {
      recoveryVerified: false,
      outstandingPaise: 0,
    })).toBe(false);
    expect(canTransitionCaseState("RECOVERY_VERIFICATION", "RESOLVED", {
      recoveryVerified: true,
      outstandingPaise: 60000,
    })).toBe(false);
    expect(transitionCaseState("RECOVERY_VERIFICATION", "AWAITING_RECOVERY")).toBe("AWAITING_RECOVERY");
    expect(transitionCaseState("RECOVERY_VERIFICATION", "RESOLVED", {
      recoveryVerified: true,
      outstandingPaise: 0,
    })).toBe("RESOLVED");
  });

  it("requires confirmed reconciliation facts and prevents a fabricated clean result (T10)", () => {
    expect(canTransitionCaseState("RECONCILED", "NO_DISCREPANCY", {
      factsConfirmed: false,
      discrepancyCount: 0,
    })).toBe(false);
    expect(canTransitionCaseState("RECONCILED", "NO_DISCREPANCY", {
      factsConfirmed: true,
      discrepancyCount: 1,
    })).toBe(false);
    expect(canTransitionCaseState("RECONCILED", "DISCREPANCY_FOUND", {
      factsConfirmed: true,
      discrepancyCount: 0,
    })).toBe(false);
  });

  it("rejects arbitrary jumps and keeps terminal outcomes terminal", () => {
    expect(CASE_STATES).toHaveLength(13);
    expect(isCaseState("RESOLVED")).toBe(true);
    expect(isCaseState("MODEL_SELECTED_STATE")).toBe(false);
    expect(canTransitionCaseState("DRAFT", "RESOLVED", {
      recoveryVerified: true,
      outstandingPaise: 0,
    })).toBe(false);
    expect(canTransitionCaseState("RESOLVED", "CLAIM_SENT", {
      merchantApprovedAt: "2026-10-03T08:00:00Z",
    })).toBe(false);
    expect(canTransitionCaseState("NO_DISCREPANCY", "CLAIM_SENT", {
      merchantApprovedAt: "2026-10-03T08:00:00Z",
    })).toBe(false);
  });

  it("allows an escalated obligation to re-enter recovery when evidence arrives", () => {
    expect(transitionCaseState("AWAITING_RECOVERY", "ESCALATED")).toBe("ESCALATED");
    expect(transitionCaseState("ESCALATED", "RECOVERY_VERIFICATION")).toBe("RECOVERY_VERIFICATION");
    expect(canTransitionCaseState("ESCALATED", "RESOLVED", {
      recoveryVerified: true,
      outstandingPaise: 0,
    })).toBe(false);
  });
});
