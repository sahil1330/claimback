import { describe, expect, it } from "vitest";
import {
  aggregateSupplierMetrics,
  serializeSupplierMetrics,
  type SupplierCaseRecord,
} from "./metrics";

const supplierA = { id: "a", name: "North Star Pharma" };
const supplierB = { id: "b", name: "Goyal Distributors" };
const supplierC = { id: "c", name: "New Supplier" };

function caseRecord(overrides: Partial<SupplierCaseRecord>): SupplierCaseRecord {
  return {
    supplierId: supplierA.id,
    status: "DRAFT",
    potentialRecoveryPaise: BigInt(0),
    recoveredPaise: BigInt(0),
    outstandingPaise: BigInt(0),
    claimSentAt: null,
    resolvedAt: null,
    createdAt: "2026-10-01T09:00:00Z",
    ...overrides,
  };
}

describe("supplier metrics", () => {
  it("counts only reconciled deliveries and returns unknown rates for no history", () => {
    const result = aggregateSupplierMetrics([supplierA, supplierC], [
      caseRecord({ status: "DRAFT" }),
      caseRecord({ status: "EVIDENCE_CAPTURED" }),
      caseRecord({ status: "NO_DISCREPANCY" }),
      caseRecord({ status: "AWAITING_RECOVERY", potentialRecoveryPaise: BigInt(50000) }),
    ]);

    expect(result[0]).toMatchObject({
      caseCount: 4,
      deliveryCount: 2,
      cleanDeliveryCount: 1,
      discrepancyCount: 1,
      cleanDeliveryRate: 0.5,
      discrepancyRate: 0.5,
      claimedPaise: BigInt(0),
      pendingRecoveryPaise: BigInt(0),
      resolutionSampleCount: 0,
      averageResolutionDays: null,
    });
    expect(result[1]).toMatchObject({
      caseCount: 0,
      deliveryCount: 0,
      discrepancyRate: null,
      cleanDeliveryRate: null,
      averageResolutionDays: null,
    });
  });

  it("keeps a promised credit pending until verified and scopes totals by supplier", () => {
    const outstanding = caseRecord({
      status: "AWAITING_RECOVERY",
      potentialRecoveryPaise: BigInt(158400),
      outstandingPaise: BigInt(158400),
      claimSentAt: "2026-10-01T10:00:00Z",
    });
    const [before] = aggregateSupplierMetrics([supplierA], [outstanding]);
    expect(before).toMatchObject({
      claimCount: 1,
      claimedPaise: BigInt(158400),
      recoveredPaise: BigInt(0),
      pendingRecoveryPaise: BigInt(158400),
    });

    const partial = { ...outstanding, recoveredPaise: BigInt(100000), outstandingPaise: BigInt(58400) };
    const [afterPartial] = aggregateSupplierMetrics([supplierA], [partial]);
    expect(afterPartial.recoveredPaise).toBe(BigInt(100000));
    expect(afterPartial.pendingRecoveryPaise).toBe(BigInt(58400));

    const full = {
      ...outstanding,
      status: "RESOLVED",
      recoveredPaise: BigInt(158400),
      outstandingPaise: BigInt(0),
      resolvedAt: "2026-10-03T09:00:00Z",
    };
    const [afterFull, other] = aggregateSupplierMetrics([supplierA, supplierB], [
      full,
      caseRecord({
        supplierId: supplierB.id,
        status: "NO_DISCREPANCY",
      }),
    ]);
    expect(afterFull.recoveredPaise).toBe(BigInt(158400));
    expect(afterFull.pendingRecoveryPaise).toBe(BigInt(0));
    expect(afterFull.averageResolutionDays).toBe(2);
    expect(afterFull.resolutionSampleCount).toBe(1);
    expect(other.recoveredPaise).toBe(BigInt(0));
    expect(other.deliveryCount).toBe(1);
  });

  it("serializes paise as exact decimal strings", () => {
    const [metrics] = aggregateSupplierMetrics([supplierA], [
      caseRecord({
        status: "RESOLVED",
        potentialRecoveryPaise: BigInt("9007199254740993"),
        recoveredPaise: BigInt("9007199254740993"),
        claimSentAt: "2026-10-01T10:00:00Z",
        resolvedAt: "2026-10-02T09:00:00Z",
      }),
    ]);
    expect(serializeSupplierMetrics(metrics)).toMatchObject({
      claimedPaise: "9007199254740993",
      recoveredPaise: "9007199254740993",
      pendingRecoveryPaise: "0",
    });
  });
});
