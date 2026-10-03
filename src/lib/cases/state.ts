/** High-level case states persisted in public.cases.status. */
export const CASE_STATES = [
  "DRAFT",
  "EVIDENCE_CAPTURED",
  "RECONCILED",
  "NO_DISCREPANCY",
  "DISCREPANCY_FOUND",
  "AWAITING_MERCHANT_APPROVAL",
  "CLAIM_SENT",
  "AWAITING_SUPPLIER",
  "SUPPLIER_RESPONDED",
  "AWAITING_RECOVERY",
  "RECOVERY_VERIFICATION",
  "RESOLVED",
  "ESCALATED",
] as const;

export type CaseState = (typeof CASE_STATES)[number];

const CASE_STATE_SET: ReadonlySet<string> = new Set(CASE_STATES);

export function isCaseState(value: unknown): value is CaseState {
  return typeof value === "string" && CASE_STATE_SET.has(value);
}

/**
 * Supply these facts from persisted merchant actions and deterministic tools.
 * Model output must never be treated as approval or verified recovery.
 */
export type CaseTransitionContext = {
  merchantApprovedAt?: string | null;
  factsConfirmed?: boolean;
  discrepancyCount?: number;
  recoveryVerified?: boolean;
  outstandingPaise?: number;
};

const NEXT_STATES: Readonly<Record<CaseState, readonly CaseState[]>> = {
  DRAFT: ["EVIDENCE_CAPTURED"],
  EVIDENCE_CAPTURED: ["RECONCILED"],
  RECONCILED: ["NO_DISCREPANCY", "DISCREPANCY_FOUND"],
  NO_DISCREPANCY: [],
  DISCREPANCY_FOUND: ["AWAITING_MERCHANT_APPROVAL"],
  AWAITING_MERCHANT_APPROVAL: ["CLAIM_SENT"],
  CLAIM_SENT: ["AWAITING_SUPPLIER"],
  AWAITING_SUPPLIER: ["SUPPLIER_RESPONDED", "ESCALATED"],
  SUPPLIER_RESPONDED: ["AWAITING_RECOVERY", "ESCALATED"],
  AWAITING_RECOVERY: ["RECOVERY_VERIFICATION", "ESCALATED"],
  RECOVERY_VERIFICATION: ["AWAITING_RECOVERY", "RESOLVED", "ESCALATED"],
  RESOLVED: [],
  // Escalation does not erase the obligation. A later response or verified
  // recovery can return the case to the ordinary recovery path.
  ESCALATED: ["SUPPLIER_RESPONDED", "AWAITING_RECOVERY", "RECOVERY_VERIFICATION"],
};

export class CaseTransitionError extends Error {
  constructor(
    readonly from: CaseState,
    readonly to: CaseState,
    reason: string,
  ) {
    super(`Cannot transition case from ${from} to ${to}: ${reason}`);
    this.name = "CaseTransitionError";
  }
}

function transitionFailure(
  from: CaseState,
  to: CaseState,
  context: CaseTransitionContext,
): string | null {
  if (!isCaseState(from) || !isCaseState(to)) return "unknown case state";
  if (!NEXT_STATES[from].includes(to)) return "transition is not allowed";

  if (to === "NO_DISCREPANCY" || to === "DISCREPANCY_FOUND") {
    if (context.factsConfirmed !== true) return "commercial facts need confirmation";
    const count = context.discrepancyCount;
    if (typeof count !== "number" || !Number.isSafeInteger(count) || count < 0) {
      return "a valid discrepancy count is required";
    }
    if (to === "NO_DISCREPANCY" && context.discrepancyCount !== 0) {
      return "a clean case cannot contain discrepancies";
    }
    if (to === "DISCREPANCY_FOUND" && context.discrepancyCount === 0) {
      return "a discrepancy is required";
    }
  }

  if (to === "CLAIM_SENT" && !context.merchantApprovedAt?.trim()) {
    return "merchant approval must be recorded before sending";
  }

  if (to === "RESOLVED") {
    if (context.recoveryVerified !== true) return "recovery has not been verified";
    if (context.outstandingPaise !== 0) return "an outstanding balance remains";
  }

  return null;
}

/** Validate a transition without mutating a case row. */
export function canTransitionCaseState(
  from: CaseState,
  to: CaseState,
  context: CaseTransitionContext = {},
): boolean {
  return transitionFailure(from, to, context) === null;
}

/** Return the next legal state, or throw before any persistence occurs. */
export function transitionCaseState(
  from: CaseState,
  to: CaseState,
  context: CaseTransitionContext = {},
): CaseState {
  const failure = transitionFailure(from, to, context);
  if (failure !== null) throw new CaseTransitionError(from, to, failure);
  return to;
}
