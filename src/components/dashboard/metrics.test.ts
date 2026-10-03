import { describe, expect, it } from "vitest";
import {
  formatPaise,
  getDashboardSummary,
  type CaseHistory,
} from "./metrics";

const supplierId = "00000000-0000-4000-8000-000000000001";
const baseCase: CaseHistory = {
  id: "00000000-0000-4000-8000-000000000002",
  supplierId,
  status: "AWAITING_RECOVERY",
  title: "Invoice #INV-3812",
  potentialRecoveryPaise: BigInt(158400),
  recoveredPaise: BigInt(0),
  outstandingPaise: BigInt(158400),
  claimSentAt: "2026-10-01T10:00:00Z",
  resolvedAt: null,
  createdAt: "2026-10-01T09:00:00Z",
};

describe("B2 recovery metrics", () => {
  it("keeps a supplier credit promise pending until verified recovery is recorded", () => {
    const before = getDashboardSummary([baseCase]);
    expect(before.marginProtectedPaise).toBe(BigInt(0));
    expect(before.pendingRecoveryPaise).toBe(BigInt(158400));
    expect(before.openClaims).toBe(1);

    const verifiedCase: CaseHistory = {
      ...baseCase,
      status: "RESOLVED",
      recoveredPaise: BigInt(158400),
      outstandingPaise: BigInt(0),
      resolvedAt: "2026-10-03T09:00:00Z",
    };
    const after = getDashboardSummary([verifiedCase]);
    expect(after.marginProtectedPaise).toBe(BigInt(158400));
    expect(after.recoveredPaise).toBe(BigInt(158400));
    expect(after.pendingRecoveryPaise).toBe(BigInt(0));
    expect(after.openClaims).toBe(0);
  });

  it("formats integer paise exactly", () => {
    expect(formatPaise(BigInt(158450))).toBe("₹1,584.50");
  });
});
