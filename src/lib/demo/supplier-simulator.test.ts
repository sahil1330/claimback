import { describe, expect, it } from "vitest";
import type { Discrepancy } from "../../types/domain";
import { supplierScenarios } from "./scenarios";
import { simulateSupplierResponse, type SupplierSimulationInput } from "./supplier-simulator";

const caseId = "00000000-0000-4000-8000-000000000001";
const source = {
  sourceArtifactId: "00000000-0000-4000-8000-000000000002",
  sourceLabel: "Demo evidence",
  excerpt: "confirmed source text",
  locator: null,
};

function difference(type: Discrepancy["type"], amountPaise: number, affectedQuantity = 2): Discrepancy {
  const kind = {
    SHORT_DELIVERY: "short_delivery",
    RATE_MISMATCH: "rate_mismatch",
    MISSING_SCHEME_UNITS: "missing_scheme_units",
    DAMAGED_GOODS: "damaged_goods",
  } as const;
  return {
    id: type,
    type,
    skuRef: "SKU-1",
    description: "Supported difference",
    affectedQuantity,
    expectedUnitPricePaise: 42800,
    billedUnitPricePaise: 44100,
    amountPaise,
    calculation: { kind: kind[type], inputs: { count: affectedQuantity } },
    promisedEvidence: source,
    billedEvidence: source,
    receivedEvidence: source,
    confidence: "high",
    status: "supported",
  };
}

const combined = [
  difference("SHORT_DELIVERY", 88200),
  difference("RATE_MISMATCH", 59800),
  difference("MISSING_SCHEME_UNITS", 42800, 1),
];

function request(overrides: Partial<SupplierSimulationInput> = {}): SupplierSimulationInput {
  return {
    scenarioId: "golden_partial_credit",
    caseId,
    claimMessageId: caseId,
    priorInboundCount: 0,
    discrepancies: combined,
    ...overrides,
  };
}

describe("supplier simulator", () => {
  it("loads distinct scenario fixtures", () => {
    expect(supplierScenarios).toHaveLength(6);
    expect(new Set(supplierScenarios.map((scenario) => scenario.id)).size).toBe(6);
  });

  it("returns a partial promise, then accepts the disputed rate after reviewing the agreement", () => {
    const first = simulateSupplierResponse(request());
    expect(first).toEqual(simulateSupplierResponse(request()));
    expect(first?.source).toBe("demo_supplier");
    expect(first?.responseKind).toBe("partial_credit_promised");
    expect(first?.body).toContain("₹1310.00");
    expect(first?.body).toContain("next invoice");
    expect(first?.body).toContain("do not accept rate difference (SKU-1): ₹598.00");

    const followUp = simulateSupplierResponse(request({ priorInboundCount: 1 }));
    expect(followUp?.responseKind).toBe("rate_credit_promised");
    expect(followUp?.body).toContain("After reviewing Demo evidence");
    expect(followUp?.body).toContain("additional ₹598.00 on your next invoice");
    expect(followUp?.body).toContain("not a credit note");
    expect(simulateSupplierResponse(request({ priorInboundCount: 2 }))).toBeNull();
  });

  it("promises a full credit without asserting verified recovery", () => {
    const response = simulateSupplierResponse(request({ scenarioId: "full_accept" }));
    expect(response?.responseKind).toBe("full_credit_promised");
    expect(response?.body).toContain("₹1908.00");
    expect(response?.body).toContain("next invoice");
    expect(simulateSupplierResponse(request({ scenarioId: "full_accept", priorInboundCount: 1 }))).toBeNull();
  });

  it("rejects a rate claim without accepting any other items", () => {
    const response = simulateSupplierResponse(request({ scenarioId: "reject_rate" }));
    expect(response?.responseKind).toBe("rate_rejected");
    expect(response?.body).toContain("do not accept rate difference");
    expect(response?.body).toContain("remaining claim items, if any, are still under review");
  });

  it("promises replacements while keeping a rate difference under review", () => {
    const response = simulateSupplierResponse(request({ scenarioId: "replacement" }));
    expect(response?.responseKind).toBe("replacement_promised");
    expect(response?.body).toContain("2 missing paid units");
    expect(response?.body).toContain("1 missing free unit");
    expect(response?.body).toContain("replacement has not been delivered yet");
    expect(response?.body).toContain("rate difference");
  });

  it("supports unresolved and no-response cases", () => {
    expect(simulateSupplierResponse(request({ scenarioId: "unresolved" }))?.responseKind).toBe("unresolved");
    expect(simulateSupplierResponse(request({ scenarioId: "no_response" }))).toBeNull();
    expect(simulateSupplierResponse(request({ scenarioId: "no_response", priorInboundCount: 5 }))).toBeNull();
  });

  it("does not claim partial acceptance if the scenario lacks its required types", () => {
    const response = simulateSupplierResponse(request({ discrepancies: [difference("RATE_MISMATCH", 59800)] }));
    expect(response?.responseKind).toBe("unresolved");
    expect(response?.body).not.toContain("accept rate difference");
  });

  it("rejects clean, ungrounded, or invalid simulation inputs", () => {
    expect(() => simulateSupplierResponse(request({ discrepancies: [] }))).toThrow();
    expect(() => simulateSupplierResponse(request({ priorInboundCount: -1 }))).toThrow();
    expect(() => simulateSupplierResponse(request({ caseId: "not-a-case" }))).toThrow();
    expect(() => simulateSupplierResponse(request({ discrepancies: [{ ...combined[0], amountPaise: -1 }] }))).toThrow();
  });
});
