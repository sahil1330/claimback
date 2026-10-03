import { addPaise, assertNonNegativeSafeInteger } from "../reconciliation/money";

export type RecoveryObligationBalance = {
  id: string;
  originalAmountPaise: number;
  recoveredPaise: number;
  outstandingPaise: number;
};

export type RecoveryAllocation = RecoveryObligationBalance & {
  appliedPaise: number;
};

export type RecoveryAllocationPlan = {
  allocations: RecoveryAllocation[];
  totalAppliedPaise: number;
  totalOutstandingPaise: number;
  unallocatedPaise: number;
  status: "missing" | "partial" | "full";
};

/**
 * Allocates an evidenced credit to obligations in the supplied order. The caller
 * is responsible for verifying the evidence and for ordering obligations (oldest
 * first is the default persistence policy).
 */
export function planRecoveryAllocation(input: {
  creditPaise: number;
  obligations: readonly RecoveryObligationBalance[];
}): RecoveryAllocationPlan {
  assertNonNegativeSafeInteger(input.creditPaise, "creditPaise");

  const seenIds = new Set<string>();
  let unallocatedPaise = input.creditPaise;
  const allocations = input.obligations.map((obligation) => {
    if (!obligation.id.trim() || seenIds.has(obligation.id)) {
      throw new RangeError("Obligation IDs must be non-empty and unique");
    }
    seenIds.add(obligation.id);

    assertNonNegativeSafeInteger(obligation.originalAmountPaise, "originalAmountPaise");
    assertNonNegativeSafeInteger(obligation.recoveredPaise, "recoveredPaise");
    assertNonNegativeSafeInteger(obligation.outstandingPaise, "outstandingPaise");
    if (
      obligation.originalAmountPaise === 0 ||
      addPaise(obligation.recoveredPaise, obligation.outstandingPaise) !==
        obligation.originalAmountPaise
    ) {
      throw new RangeError("Obligation balance must equal original amount");
    }

    const appliedPaise = Math.min(unallocatedPaise, obligation.outstandingPaise);
    unallocatedPaise -= appliedPaise;

    return {
      id: obligation.id,
      originalAmountPaise: obligation.originalAmountPaise,
      recoveredPaise: addPaise(obligation.recoveredPaise, appliedPaise),
      outstandingPaise: obligation.outstandingPaise - appliedPaise,
      appliedPaise,
    };
  });

  const totalAppliedPaise = addPaise(...allocations.map(({ appliedPaise }) => appliedPaise));
  const totalOutstandingPaise = addPaise(
    ...allocations.map(({ outstandingPaise }) => outstandingPaise),
  );

  return {
    allocations,
    totalAppliedPaise,
    totalOutstandingPaise,
    unallocatedPaise,
    status: totalAppliedPaise === 0 ? "missing" : totalOutstandingPaise === 0 ? "full" : "partial",
  };
}
