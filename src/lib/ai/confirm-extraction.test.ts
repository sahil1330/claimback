import { describe, expect, it, vi } from "vitest";
import { normalizeAgreementOutput, normalizeInvoiceOutput } from "./normalize";
import { prepareConfirmedExtraction } from "./confirm-extraction";
import { prepareCaseFacts } from "../../components/receiving/prepare-facts";
import { verifyEvidenceSources } from "../cases/facts";
import type { InvoiceFacts } from "../../types/domain";

vi.mock("server-only", () => ({}));
vi.mock("../auth/session", () => ({}));
vi.mock("../auth/case-access", () => ({}));
vi.mock("../supabase/admin", () => ({}));

const artifactId = "d26b22b5-4d57-48be-a121-dd211143800c";
const actorId = "753adf5b-d44f-42f8-9ad7-8a0924a973a5";
const caseId = "7a10cd19-c42d-4ff3-865a-ac04aeb8cfa3";
const source = { artifactId, label: "invoice.txt" };
const sourceEvidence = { excerpt: "Maggi 70g 20 units", locator: "page 1 row 2" };
const modelLine = {
  rawName: "Maggi 70g", skuRef: "MG-70", unit: "box", packSize: "70g",
  quantity: 20, unitPriceText: null, discountText: null,
  confidence: "low" as const, evidence: sourceEvidence,
  uncertainties: [{ field: "unitPriceText", reason: "Digit obscured" }],
};

function uncertainInvoice() {
  const result = normalizeInvoiceOutput({
    invoiceNumber: "INV-3812", supplierName: "City Distributor",
    evidence: { excerpt: "INV-3812 City Distributor", locator: "page 1 header" },
    lines: [modelLine], uncertainties: [],
  }, source);
  if (result.status !== "needs_confirmation") throw new Error("Fixture must be uncertain");
  return result;
}

function input(result: { confirmations: Array<{ field: string; reason: string }> }, corrections: Record<string, unknown> = {}) {
  return {
    caseId, artifactId,
    acknowledgments: result.confirmations.map(({ field, reason }) => ({ field, reason })),
    corrections,
  };
}

describe("merchant-confirmed extraction", () => {
  it("T18 converts a flagged model rate to integer paise, clears reviewed uncertainty and keeps its source", () => {
    const original = uncertainInvoice();
    expect(original.confirmations.some(({ field }) => field === "lines.0.unitPriceText")).toBe(true);
    const prepared = prepareConfirmedExtraction(
      original, "invoice", artifactId,
      input(original, { "lines.0.unitPricePaise": 44100 }), actorId, "2026-10-03T10:30:00.000Z",
    );
    expect(prepared.result.status).toBe("ready");
    expect(prepared.result.facts.lines[0]).toMatchObject({
      unitPricePaise: 44100,
      quantity: 20,
      confidence: "high",
      uncertainties: [],
      source: { sourceArtifactId: artifactId, excerpt: sourceEvidence.excerpt },
    });
    expect(prepared.audit.originalFacts.lines[0].unitPricePaise).toBeNull();
    expect(prepared.audit.changes).toEqual([{ path: "lines.0.unitPricePaise", before: null, after: 44100 }]);
    expect(prepared.stored.confirmationAudit.actorId).toBe(actorId);
  });

  it("T18 confirmed lines pass the receiving source guard and case-facts evidence check", () => {
    const uncertain = uncertainInvoice();
    const invoice = prepareConfirmedExtraction(uncertain, "invoice", artifactId,
      input(uncertain, { "lines.0.unitPricePaise": 44100 }),
      actorId, "2026-10-03T10:30:00.000Z").result.facts as InvoiceFacts;
    const agreementId = "b7bd1e1e-dbf6-43f1-8050-965356fb3e60";
    const agreementResult = normalizeAgreementOutput({
      supplierName: "City Distributor", promiseText: "20 Maggi boxes at 428",
      evidence: { excerpt: "20 Maggi boxes at 428", locator: "message 1" },
      lines: [{ ...modelLine, unitPriceText: "428", confidence: "high", uncertainties: [], scheme: null }],
      uncertainties: [],
    }, { artifactId: agreementId, label: "agreement.txt" });
    if (agreementResult.status !== "ready") throw new Error("Agreement fixture must be ready");
    const reconciliation = prepareCaseFacts(caseId, invoice, agreementResult.facts, [{
      promisedIndex: 0, matchConfirmed: true, paid: "20", free: "0", damaged: "0",
    }]);
    expect(() => verifyEvidenceSources(caseId, reconciliation, [
      { id: artifactId, type: "invoice", extraction_status: "complete", extracted: { status: "ready", facts: invoice, confirmations: [] } },
      { id: agreementId, type: "agreement", extraction_status: "complete", extracted: agreementResult },
    ])).not.toThrow();
  });

  it("rejects omitted or forged acknowledgments and unrelated clean-field edits", () => {
    const original = uncertainInvoice();
    expect(() => prepareConfirmedExtraction(original, "invoice", artifactId, {
      ...input(original), acknowledgments: original.confirmations.slice(1),
    }, actorId, "2026-10-03T10:30:00.000Z")).toThrow(/every flagged field/);
    expect(() => prepareConfirmedExtraction(original, "invoice", artifactId, {
      ...input(original), acknowledgments: [
        ...input(original).acknowledgments, { field: "invoiceNumber", reason: "forged" },
      ],
    }, actorId, "2026-10-03T10:30:00.000Z")).toThrow(/every flagged field/);
    expect(() => prepareConfirmedExtraction(original, "invoice", artifactId,
      input(original, { invoiceNumber: "FAKE", "lines.0.unitPricePaise": 44100 }),
      actorId, "2026-10-03T10:30:00.000Z")).toThrow(/invoiceNumber was not requested/);
  });

  it("requires all line quantities, rates and source locations before marking ready", () => {
    const original = uncertainInvoice();
    expect(() => prepareConfirmedExtraction(original, "invoice", artifactId, input(original),
      actorId, "2026-10-03T10:30:00.000Z")).toThrow(/quantity, rate, and evidence location/);
    const noLocator = normalizeInvoiceOutput({
      invoiceNumber: "INV-3812", supplierName: "City Distributor",
      evidence: { excerpt: null, locator: null },
      lines: [{ ...modelLine, unitPriceText: "441", confidence: "high", uncertainties: [], evidence: { excerpt: null, locator: null } }],
      uncertainties: [],
    }, source);
    if (noLocator.status !== "needs_confirmation") throw new Error("Fixture must be uncertain");
    expect(() => prepareConfirmedExtraction(noLocator, "invoice", artifactId, input(noLocator),
      actorId, "2026-10-03T10:30:00.000Z")).toThrow(/quantity, rate, and evidence location/);
    const confirmed = prepareConfirmedExtraction(noLocator, "invoice", artifactId,
      input(noLocator, { "lines.0.source.locator": "page 1 row 2" }),
      actorId, "2026-10-03T10:30:00.000Z");
    expect(confirmed.result.facts.lines[0].source).toMatchObject({
      sourceArtifactId: artifactId, locator: "page 1 row 2", excerpt: null,
    });
    expect(confirmed.audit.originalFacts.lines[0].source.locator).toBeNull();
  });

  it("rejects stale, wrong-artifact, malformed and unrequested source changes", () => {
    const original = uncertainInvoice();
    expect(() => prepareConfirmedExtraction({ ...original, status: "ready" }, "invoice", artifactId,
      input(original), actorId, "2026-10-03T10:30:00.000Z")).toThrow(/not awaiting/);
    expect(() => prepareConfirmedExtraction(original, "invoice", caseId,
      input(original), actorId, "2026-10-03T10:30:00.000Z")).toThrow(/does not match/);
    expect(() => prepareConfirmedExtraction(original, "invoice", artifactId,
      input(original, { "lines.0.unitPricePaise": 44.1 }),
      actorId, "2026-10-03T10:30:00.000Z")).toThrow(/wrong format/);
    expect(() => prepareConfirmedExtraction(original, "invoice", artifactId,
      input(original, { "lines.0.source.locator": "invented" }),
      actorId, "2026-10-03T10:30:00.000Z")).toThrow(/not requested/);
  });

  it("requires explicit line review before promoting medium confidence", () => {
    const medium = normalizeInvoiceOutput({
      invoiceNumber: "INV-3812", supplierName: "City Distributor",
      evidence: { excerpt: "INV-3812 City Distributor", locator: "header" },
      lines: [{ ...modelLine, unitPriceText: "441", confidence: "medium", uncertainties: [] }],
      uncertainties: [],
    }, source);
    if (medium.status !== "needs_confirmation") throw new Error("Medium source needs review");
    expect(medium.confirmations.some(({ field }) => field === "lines.0")).toBe(true);
    const confirmed = prepareConfirmedExtraction(medium, "invoice", artifactId,
      input(medium), actorId, "2026-10-03T10:30:00.000Z");
    expect(confirmed.result.facts.lines[0].confidence).toBe("high");
    const legacy = {
      ...medium,
      confirmations: [{ field: "invoiceNumber", reason: "Legacy document review", source: medium.facts.source }],
    };
    expect(() => prepareConfirmedExtraction(legacy, "invoice", artifactId,
      input(legacy), actorId, "2026-10-03T10:30:00.000Z")).toThrow(/explicit confidence review/);
  });

  it("accepts agreement corrections only for flagged agreement fact paths", () => {
    const original = normalizeAgreementOutput({
      supplierName: "City Distributor", promiseText: "Maggi 20 boxes at 428",
      evidence: { excerpt: "Maggi 20 boxes at 428", locator: null },
      lines: [{ ...modelLine, unitPriceText: null, confidence: "high", uncertainties: [], scheme: null }],
      uncertainties: [],
    }, source);
    if (original.status !== "needs_confirmation") throw new Error("Fixture must be uncertain");
    const confirmed = prepareConfirmedExtraction(original, "agreement", artifactId,
      input(original, { "lines.0.unitPricePaise": 42800 }),
      actorId, "2026-10-03T10:30:00.000Z");
    expect(confirmed.result.facts.lines[0].unitPricePaise).toBe(42800);
    expect(() => prepareConfirmedExtraction(original, "agreement", artifactId,
      input(original, { "lines.0.scheme": { buyQuantity: 10, freeQuantity: 1 }, "lines.0.unitPricePaise": 42800 }),
      actorId, "2026-10-03T10:30:00.000Z")).toThrow(/not requested/);
  });

  it("accepts a whole validated scheme when the model flags a nested scheme field", () => {
    const original = normalizeAgreementOutput({
      supplierName: "City Distributor", promiseText: "20 Maggi boxes at 428, scheme unclear",
      evidence: { excerpt: "20 Maggi boxes at 428, scheme unclear", locator: "message 1" },
      lines: [{ ...modelLine, unitPriceText: "428", confidence: "high", scheme: { buyQuantity: 10, freeQuantity: 1 },
        uncertainties: [{ field: "scheme.freeQuantity", reason: "Free count unclear" }] }],
      uncertainties: [],
    }, source);
    if (original.status !== "needs_confirmation") throw new Error("Scheme fixture must be uncertain");
    const confirmed = prepareConfirmedExtraction(original, "agreement", artifactId,
      input(original, { "lines.0.scheme": { buyQuantity: 10, freeQuantity: 2 } }),
      actorId, "2026-10-03T10:30:00.000Z");
    expect(confirmed.result.facts.lines[0]).toMatchObject({ scheme: { buyQuantity: 10, freeQuantity: 2 }, uncertainties: [] });
  });
});
