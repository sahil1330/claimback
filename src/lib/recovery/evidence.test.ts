import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ generateText: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("ai", () => ({
  generateText: mocks.generateText,
  Output: { object: vi.fn(() => ({})) },
}));

import { extractRecoveryEvidence, normalizeRecoveryEvidence } from "./evidence";

const artifactId = "ab573f59-d382-44ba-a9d0-21b18a5fccda";
const source = { artifactId, label: "later-evidence.txt" };
const initialKey = process.env.OPENAI_API_KEY;
const initialModel = process.env.OPENAI_EXTRACTION_MODEL;

afterEach(() => {
  if (initialKey === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = initialKey;
  if (initialModel === undefined) delete process.env.OPENAI_EXTRACTION_MODEL;
  else process.env.OPENAI_EXTRACTION_MODEL = initialModel;
  vi.clearAllMocks();
});

describe("recovery evidence extraction", () => {
  it("reads an issued credit note amount in exact integer paise", () => {
    const text = "CREDIT NOTE CN-104\nCredit amount ₹1,584.00 against invoice INV-3812";
    const result = normalizeRecoveryEvidence(source, {
      evidenceType: "credit_note",
      amountText: "₹1,584.00",
      referenceText: "CN-104",
      sourceExcerpt: "Credit amount ₹1,584.00 against invoice INV-3812",
      sourceLocator: null,
      uncertainties: [],
    }, text);
    expect(result).toMatchObject({
      status: "ready",
      evidence: {
        explicitAmountPaise: 158400,
        evidenceType: "credit_note",
        referenceText: "CN-104",
        source: { sourceArtifactId: artifactId, sourceLabel: source.label },
      },
    });
  });

  it("reads a partial credit printed on a later invoice", () => {
    const text = "Invoice INV-4001\nCredit adjustment ₹1,000\nAmount due ₹2,000";
    const result = normalizeRecoveryEvidence(source, {
      evidenceType: "invoice_credit",
      amountText: "₹1,000",
      referenceText: "INV-4001",
      sourceExcerpt: "Credit adjustment ₹1,000",
      sourceLocator: "line 2",
      uncertainties: [],
    }, text);
    expect(result).toMatchObject({ status: "ready", evidence: { explicitAmountPaise: 100000 } });
  });

  it("represents a later invoice with no visible credit as a zero-impact observation", () => {
    const text = "Invoice INV-4002\nAmount due ₹2,000";
    const result = normalizeRecoveryEvidence(source, {
      evidenceType: "invoice_no_credit",
      amountText: null,
      referenceText: "INV-4002",
      sourceExcerpt: "Invoice INV-4002",
      sourceLocator: null,
      uncertainties: [],
    }, text);
    expect(result).toMatchObject({ status: "ready", evidence: { explicitAmountPaise: null, evidenceType: "invoice_no_credit" } });
  });

  it("never treats a supplier's future credit promise as posted recovery", () => {
    const text = "Next invoice mein ₹1,584 adjust kar denge.";
    const result = normalizeRecoveryEvidence(source, {
      evidenceType: "invoice_credit",
      amountText: "₹1,584",
      referenceText: null,
      sourceExcerpt: text,
      sourceLocator: null,
      uncertainties: [],
    }, text);
    expect(result.status).toBe("needs_confirmation");
    if (result.status === "needs_confirmation") {
      expect(result.confirmations).toContain("A future credit promise is not a posted recovery");
      expect(result.evidence.explicitAmountPaise).toBeNull();
    }
  });

  it("requires a document identity when a supplier message claims an amount", () => {
    const text = "Credit amount ₹900 accepted by supplier.";
    const result = normalizeRecoveryEvidence(source, {
      evidenceType: "credit_note",
      amountText: "₹900",
      referenceText: null,
      sourceExcerpt: text,
      sourceLocator: null,
      uncertainties: [],
    }, text);
    expect(result).toMatchObject({
      status: "needs_confirmation",
      evidence: { explicitAmountPaise: null },
    });
  });

  it("requires the printed amount within a verbatim source excerpt", () => {
    const text = "CREDIT NOTE CN-105\nCredit amount ₹900";
    const result = normalizeRecoveryEvidence(source, {
      evidenceType: "credit_note",
      amountText: "₹1,584",
      referenceText: "CN-105",
      sourceExcerpt: "Credit amount ₹900",
      sourceLocator: null,
      uncertainties: [],
    }, text);
    expect(result.status).toBe("needs_confirmation");
  });

  it("does not turn a unit rate or an unreadable note into verified credit", () => {
    const text = "CREDIT NOTE CN-106\nRate ₹300 per box";
    const rate = normalizeRecoveryEvidence(source, {
      evidenceType: "credit_note",
      amountText: "₹300 per box",
      referenceText: "CN-106",
      sourceExcerpt: "Rate ₹300 per box",
      sourceLocator: null,
      uncertainties: [],
    }, text);
    expect(rate.status).toBe("needs_confirmation");
    const missing = normalizeRecoveryEvidence(source, {
      evidenceType: "credit_note",
      amountText: null,
      referenceText: "CN-106",
      sourceExcerpt: "CREDIT NOTE CN-106",
      sourceLocator: null,
      uncertainties: [],
    }, text);
    expect(missing.status).toBe("needs_confirmation");
  });

  it("passes image bytes as a file part to the installed AI SDK", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    process.env.OPENAI_EXTRACTION_MODEL = "test-model";
    mocks.generateText.mockResolvedValueOnce({ output: {
      evidenceType: "credit_note",
      amountText: "₹900",
      referenceText: "CN-107",
      sourceExcerpt: "Credit amount ₹900",
      sourceLocator: "top right",
      uncertainties: [],
    } });
    const result = await extractRecoveryEvidence({
      ...source,
      mimeType: "image/png",
      bytes: Uint8Array.of(1, 2, 3),
    });
    expect(result).toMatchObject({ status: "ready", evidence: { explicitAmountPaise: 90000 } });
    expect(mocks.generateText.mock.calls[0][0].messages[0].content[1]).toMatchObject({
      type: "file", mediaType: "image/png",
    });
  });

  it("returns recoverable errors for unsupported input and model failure", async () => {
    const unsupported = await extractRecoveryEvidence({
      ...source,
      mimeType: "application/zip",
      bytes: Uint8Array.of(1),
    });
    expect(unsupported).toMatchObject({ status: "error", error: { code: "UNSUPPORTED_SOURCE", recoverable: true } });

    process.env.OPENAI_API_KEY = "test-key";
    process.env.OPENAI_EXTRACTION_MODEL = "test-model";
    mocks.generateText.mockRejectedValueOnce(new Error("unavailable"));
    const failed = await extractRecoveryEvidence({
      ...source,
      mimeType: "text/plain",
      bytes: new TextEncoder().encode("CREDIT NOTE CN-108"),
    });
    expect(failed).toMatchObject({ status: "error", error: { code: "MODEL_FAILED", recoverable: true } });
  });
});
