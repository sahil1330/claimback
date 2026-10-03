import { describe, expect, it } from "vitest";
import { parseSupplierMetricsResponse } from "./metrics-api";

describe("A7 supplier metrics response", () => {
  const supplier = {
    id: "00000000-0000-4000-8000-000000000001",
    name: "North Star Pharma",
    caseCount: 1,
    deliveryCount: 1,
    cleanDeliveryCount: 0,
    discrepancyCount: 1,
    cleanDeliveryRate: 0,
    discrepancyRate: 1,
    claimCount: 1,
    claimedPaise: "158400",
    recoveredPaise: "0",
    pendingRecoveryPaise: "158400",
    resolutionSampleCount: 0,
    averageResolutionDays: null,
  };

  it("keeps paise exact and zero rates distinct from absent rates", () => {
    expect(parseSupplierMetricsResponse({ suppliers: [supplier] })).toMatchObject([{
      claimedPaise: BigInt(158400),
      recoveredPaise: BigInt(0),
      pendingRecoveryPaise: BigInt(158400),
      cleanDeliveryRate: 0,
    }]);
    expect(parseSupplierMetricsResponse({ suppliers: [{
      ...supplier,
      deliveryCount: 0,
      cleanDeliveryRate: null,
      discrepancyRate: null,
    }] })[0].cleanDeliveryRate).toBeNull();
  });

  it("rejects malformed monetary values at the API boundary", () => {
    expect(() => parseSupplierMetricsResponse({ suppliers: [{
      ...supplier,
      recoveredPaise: "1.50",
    }] })).toThrow();
  });
});
