import { describe, expect, it } from "vitest";
import { reconcileCase, type ReconciliationInput } from "../../lib/reconciliation/engine";
import { evidenceHref, presentDiscrepancy } from "./presentation";

const caseId = "00000000-0000-4000-8000-000000000001";
const invoiceId = "00000000-0000-4000-8000-000000000002";
const agreementId = "00000000-0000-4000-8000-000000000003";
const source = (sourceArtifactId: string, sourceLabel: string) => ({
  sourceArtifactId, sourceLabel, excerpt: "Paracetamol 500 mg tablets", locator: null,
});

const input: ReconciliationInput = {
  groups: [{
    skuRef: "PARA500", matchStatus: "matched",
    promised: {
      rawName: "Paracetamol 500 mg tablets", skuRef: "PARA500", unit: "box", packSize: "10 strips",
      quantity: 50, unitPricePaise: 42800, discountPaise: null,
      scheme: { buyQuantity: 10, freeQuantity: 1 },
      source: source(agreementId, "Supplier promise"), confidence: "high", uncertainties: [],
    },
    billed: {
      rawName: "Paracetamol 500 mg tablets", skuRef: "PARA500", unit: "box", packSize: "10 strips",
      quantity: 50, unitPricePaise: 44100, discountPaise: null,
      source: source(invoiceId, "Invoice #INV-3812"), confidence: "high", uncertainties: [],
    },
    received: {
      rawName: "Paracetamol 500 mg tablets", skuRef: "PARA500", unit: "box", packSize: "10 strips",
      receivedQuantity: 48, receivedFreeQuantity: 3, damagedQuantity: 2, merchantConfirmed: true,
      source: source(caseId, "Merchant-confirmed receiving input"), confidence: "high", uncertainties: [],
    },
  }],
};

describe("B4 source-grounded presentation", () => {
  it("presents all four deterministic amounts and their exact inputs", () => {
    const result = reconcileCase(input);
    expect(result.outcome).toBe("discrepancy");
    if (result.outcome !== "discrepancy") return;
    expect(result.discrepancies.map((item) => [item.type, item.amountPaise])).toEqual([
      ["SHORT_DELIVERY", 88200], ["RATE_MISMATCH", 59800],
      ["MISSING_SCHEME_UNITS", 85600], ["DAMAGED_GOODS", 88200],
    ]);
    const displayed = result.discrepancies.map(presentDiscrepancy);
    expect(displayed.map((item) => item.title)).toEqual([
      "Short delivery", "Rate mismatch", "Missing free units", "Damaged goods",
    ]);
    expect(displayed[0].promised).toContain("₹428");
    expect(displayed[0].formula).toContain("50 billed − 48 received = 2 missing");
    expect(displayed[1].formula).toContain("46 saleable units × (₹441 billed − ₹428 agreed) = ₹598");
    expect(displayed[2].formula).toContain("5 due − 3 received = 2 missing");
    expect(displayed[3].formula).toContain("2 damaged × ₹441 = ₹882");
  });

  it("opens stored evidence and keeps merchant form confirmation in the page", () => {
    expect(evidenceHref(caseId, source(invoiceId, "Invoice"))).toBe(`/api/evidence?caseId=${caseId}&artifactId=${invoiceId}`);
    expect(evidenceHref(caseId, source(caseId, "Merchant-confirmed receiving input"))).toBeNull();
  });
});
