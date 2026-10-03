import { describe, expect, it } from "vitest";
import type { AgreementFacts, InvoiceFacts } from "../../types/domain";
import { initialReceivingDrafts, prepareCaseFacts } from "./prepare-facts";

const caseId = "00000000-0000-4000-8000-000000000001";
const invoiceArtifactId = "00000000-0000-4000-8000-000000000002";
const agreementArtifactId = "00000000-0000-4000-8000-000000000003";

const invoice: InvoiceFacts = {
  invoiceNumber: "INV-3812",
  supplierName: "North Star Pharma",
  source: { sourceArtifactId: invoiceArtifactId, sourceLabel: "Invoice #INV-3812", excerpt: "50 boxes at ₹441", locator: null },
  uncertainties: [],
  lines: [{
    rawName: "Paracetamol 500 mg", skuRef: "PARA500", unit: "box", packSize: null,
    quantity: 50, unitPricePaise: 44100, discountPaise: null,
    source: { sourceArtifactId: invoiceArtifactId, sourceLabel: "Invoice #INV-3812", excerpt: "Paracetamol 500 mg, 50 boxes at ₹441", locator: null },
    confidence: "high", uncertainties: [],
  }],
};

const agreement: AgreementFacts = {
  supplierName: "North Star Pharma", promiseText: "50 boxes at ₹428, 10+1",
  source: { sourceArtifactId: agreementArtifactId, sourceLabel: "Supplier agreement", excerpt: "50 boxes at ₹428, 10+1", locator: null },
  uncertainties: [],
  lines: [{
    rawName: "Paracetamol 500 mg", skuRef: "PARA500", unit: "box", packSize: null,
    quantity: 50, unitPricePaise: 42800, discountPaise: null, scheme: { buyQuantity: 10, freeQuantity: 1 },
    source: { sourceArtifactId: agreementArtifactId, sourceLabel: "Supplier agreement", excerpt: "Paracetamol 500 mg, 50 boxes at ₹428", locator: null },
    confidence: "high", uncertainties: [],
  }],
};

describe("Receive Stock confirmed facts", () => {
  it("requires explicit free and damaged counts before sending merchant-confirmed facts", () => {
    const drafts = initialReceivingDrafts(invoice, agreement);
    expect(drafts[0].promisedIndex).toBe(0);
    expect(() => prepareCaseFacts(caseId, invoice, agreement, [{ ...drafts[0], paid: "48", damaged: "2" }])).toThrow(/free scheme units/);

    const input = prepareCaseFacts(caseId, invoice, agreement, [{ ...drafts[0], paid: "48", free: "3", damaged: "2" }]);
    expect(input.groups[0].received.merchantConfirmed).toBe(true);
    expect(input.groups[0].received.receivedQuantity).toBe(48);
    expect(input.groups[0].received.receivedFreeQuantity).toBe(3);
    expect(input.groups[0].received.damagedQuantity).toBe(2);
    expect(input.groups[0].received.source.sourceArtifactId).toBe(caseId);
  });

  it("does not silently match a different product", () => {
    const mismatched: AgreementFacts = {
      ...agreement,
      lines: [{ ...agreement.lines[0], rawName: "Cough syrup", skuRef: "COUGH100" }],
    };
    const drafts = [{ promisedIndex: 0, matchConfirmed: false, paid: "48", free: "3", damaged: "2" }];
    expect(() => prepareCaseFacts(caseId, invoice, mismatched, drafts)).toThrow(/Confirm that/);
    expect(prepareCaseFacts(caseId, invoice, mismatched, [{ ...drafts[0], matchConfirmed: true }]).groups[0].matchStatus).toBe("merchant_confirmed");
  });
});
