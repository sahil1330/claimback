import { describe, expect, it } from "vitest";
import { planRecoveryAllocation } from "./allocation";

const obligation = (amount: number) => ({
  id: "obligation-1",
  originalAmountPaise: amount,
  recoveredPaise: 0,
  outstandingPaise: amount,
});

describe("verified recovery allocation", () => {
  it("T8/T15 fully recovers the exact outstanding amount", () => {
    const plan = planRecoveryAllocation({
      creditPaise: 158400,
      obligations: [obligation(158400)],
    });
    expect(plan).toMatchObject({
      status: "full",
      totalAppliedPaise: 158400,
      totalOutstandingPaise: 0,
      unallocatedPaise: 0,
      allocations: [{ appliedPaise: 158400, recoveredPaise: 158400, outstandingPaise: 0 }],
    });
  });

  it("T9/T14 keeps the unverified balance open after a partial credit", () => {
    const plan = planRecoveryAllocation({
      creditPaise: 100000,
      obligations: [obligation(158400)],
    });
    expect(plan).toMatchObject({
      status: "partial",
      totalAppliedPaise: 100000,
      totalOutstandingPaise: 58400,
      allocations: [{ recoveredPaise: 100000, outstandingPaise: 58400 }],
    });
  });

  it("T13 leaves the obligation untouched when the future invoice has no credit", () => {
    const plan = planRecoveryAllocation({
      creditPaise: 0,
      obligations: [obligation(158400)],
    });
    expect(plan).toMatchObject({
      status: "missing",
      totalAppliedPaise: 0,
      totalOutstandingPaise: 158400,
      allocations: [{ appliedPaise: 0, recoveredPaise: 0, outstandingPaise: 158400 }],
    });
  });

  it("allocates oldest-first across obligations and caps excess credit", () => {
    const plan = planRecoveryAllocation({
      creditPaise: 35000,
      obligations: [
        { ...obligation(10000), id: "oldest" },
        { ...obligation(20000), id: "newest" },
      ],
    });
    expect(plan).toMatchObject({
      status: "full",
      totalAppliedPaise: 30000,
      totalOutstandingPaise: 0,
      unallocatedPaise: 5000,
      allocations: [
        { id: "oldest", appliedPaise: 10000, outstandingPaise: 0 },
        { id: "newest", appliedPaise: 20000, outstandingPaise: 0 },
      ],
    });
  });

  it("continues an existing partial balance without reapplying prior credit", () => {
    const plan = planRecoveryAllocation({
      creditPaise: 58400,
      obligations: [{
        id: "obligation-1",
        originalAmountPaise: 158400,
        recoveredPaise: 100000,
        outstandingPaise: 58400,
      }],
    });
    expect(plan).toMatchObject({
      status: "full",
      totalAppliedPaise: 58400,
      allocations: [{ recoveredPaise: 158400, outstandingPaise: 0 }],
    });
  });

  it("rejects unsafe values, duplicate obligations, and inconsistent balances", () => {
    expect(() => planRecoveryAllocation({ creditPaise: 0.1, obligations: [] })).toThrow();
    expect(() => planRecoveryAllocation({ creditPaise: -1, obligations: [] })).toThrow();
    expect(() => planRecoveryAllocation({
      creditPaise: 100,
      obligations: [{ ...obligation(100), outstandingPaise: 99 }],
    })).toThrow();
    expect(() => planRecoveryAllocation({
      creditPaise: 100,
      obligations: [obligation(100), obligation(100)],
    })).toThrow();
  });
});
