import { describe, expect, it } from "vitest";
import {
  confirmReceivingInput,
  normalizeAgreementOutput,
  normalizeInvoiceOutput,
  normalizeReceivingOutput,
} from "./normalize";
import { parsePrintedRupees } from "./money-text";

const source = {
  artifactId: "f4cc15b4-8614-45ef-ab6b-ad7fb85beea3",
  label: "Invoice #INV-3812",
};

const invoice = {
  invoiceNumber: "INV-3812",
  supplierName: "City Distributor",
  evidence: { excerpt: "INV-3812 City Distributor", locator: "page 1 header" },
  lines: [{
    rawName: "Maggi 70g",
    skuRef: "MG-70",
    unit: "box",
    packSize: "70g",
    quantity: 20,
    unitPriceText: "₹441.00",
    discountText: null,
    confidence: "high",
    evidence: { excerpt: "Maggi 70g 20 ₹441.00", locator: "page 1 row 2" },
    uncertainties: [],
  }],
  uncertainties: [],
};

describe("source-grounded extraction normalization", () => {
  it("converts printed rupees exactly and injects the real artifact ID", () => {
    const result = normalizeInvoiceOutput(invoice, source);
    expect(result.status).toBe("ready");
    if (result.status === "error") throw new Error("unexpected extraction error");
    expect(result.facts.lines[0].unitPricePaise).toBe(44100);
    expect(result.facts.lines[0].source).toEqual({
      sourceArtifactId: source.artifactId,
      sourceLabel: source.label,
      excerpt: "Maggi 70g 20 ₹441.00",
      locator: "page 1 row 2",
    });
  });

  it("T18 keeps an unclear invoice rate null and asks for confirmation", () => {
    const result = normalizeInvoiceOutput({
      ...invoice,
      lines: [{ ...invoice.lines[0], unitPriceText: null, confidence: "low", uncertainties: [{ field: "unitPriceText", reason: "Digit obscured" }] }],
    }, source);
    expect(result.status).toBe("needs_confirmation");
    if (result.status !== "needs_confirmation") throw new Error("confirmation expected");
    expect(result.facts.lines[0].unitPricePaise).toBeNull();
    expect(result.confirmations.some((item) => item.field === "lines.0.unitPricePaise")).toBe(true);
  });

  it("does not accept a model-generated invalid money amount", () => {
    const result = normalizeInvoiceOutput({
      ...invoice,
      lines: [{ ...invoice.lines[0], unitPriceText: "around ₹441" }],
    }, source);
    expect(result.status).toBe("needs_confirmation");
    if (result.status === "error") throw new Error("unexpected extraction error");
    expect(result.facts.lines[0].unitPricePaise).toBeNull();
  });

  it("requires confirmation when a model value is absent from text evidence", () => {
    const result = normalizeInvoiceOutput(invoice, source, "INV-3812 City Distributor. Maggi 70g MG-70 20 boxes at ₹428.00");
    expect(result.status).toBe("needs_confirmation");
    if (result.status !== "needs_confirmation") throw new Error("confirmation expected");
    expect(result.confirmations.some((item) => item.field === "lines.0.unitPricePaise")).toBe(true);
  });

  it("extracts a 10+1 promise without calculating a claim amount", () => {
    const result = normalizeAgreementOutput({
      supplierName: "City Distributor",
      promiseText: "Buy 10 get 1 free",
      evidence: { excerpt: "Buy 10 get 1 free", locator: null },
      lines: [{
        rawName: "Maggi 70g", skuRef: "MG-70", unit: "box", packSize: "70g", quantity: 50,
        unitPriceText: "₹428", discountText: null,
        scheme: { buyQuantity: 10, freeQuantity: 1 },
        confidence: "high", evidence: { excerpt: "Maggi 70g 50 at ₹428; buy 10 get 1", locator: null },
        uncertainties: [],
      }],
      uncertainties: [],
    }, source);
    expect(result.status).toBe("ready");
    if (result.status === "error") throw new Error("unexpected extraction error");
    expect(result.facts.lines[0]).toMatchObject({
      unitPricePaise: 42800,
      scheme: { buyQuantity: 10, freeQuantity: 1 },
    });
  });

  it("receiving suggestions remain unconfirmed until explicit merchant input", () => {
    const suggestion = normalizeReceivingOutput({
      evidence: { excerpt: "Maggi 48 peti aaye, do damage hain", locator: null },
      lines: [{
        rawName: "Maggi", skuRef: null, unit: "box", packSize: null, receivedQuantity: 48, receivedFreeQuantity: null, damagedQuantity: 2,
        confidence: "high", evidence: { excerpt: "Maggi 48 peti aaye, do damage hain", locator: null },
        uncertainties: [],
      }],
      uncertainties: [],
    }, source);
    expect(suggestion.status).toBe("needs_confirmation");
    if (suggestion.status === "error") throw new Error("unexpected extraction error");
    expect(suggestion.facts.lines[0].merchantConfirmed).toBe(false);

    const confirmed = confirmReceivingInput({
      source: suggestion.facts.source,
      lines: [{ rawName: "Maggi", skuRef: null, unit: "box", packSize: null, receivedQuantity: 47, receivedFreeQuantity: 0, damagedQuantity: 2 }],
    });
    expect(confirmed.lines[0]).toMatchObject({ receivedQuantity: 47, damagedQuantity: 2, merchantConfirmed: true });
  });

  it("rejects damaged units above received units", () => {
    expect(() => confirmReceivingInput({
      source: { sourceArtifactId: source.artifactId, sourceLabel: source.label, excerpt: null, locator: null },
      lines: [{ rawName: "Maggi", skuRef: null, unit: "box", packSize: null, receivedQuantity: 2, receivedFreeQuantity: 0, damagedQuantity: 3 }],
    })).toThrow();
  });
});

describe("printed money conversion", () => {
  it("handles rupees and paise exactly without floats", () => {
    expect(parsePrintedRupees("₹1,23,456.78")).toBe(12_345_678);
    expect(parsePrintedRupees("Rs. 428.5")).toBe(42_850);
    expect(parsePrintedRupees("₹428 per box")).toBe(42_800);
    expect(parsePrintedRupees("₹1,2,3")).toBeNull();
  });
});
