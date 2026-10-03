import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ generateText: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("ai", () => ({
  generateText: mocks.generateText,
  Output: { object: vi.fn(() => ({})) },
}));

import { extractInvoice } from "./extract";

const initialKey = process.env.OPENAI_API_KEY;
const initialModel = process.env.OPENAI_EXTRACTION_MODEL;
const input = {
  artifactId: "f4cc15b4-8614-45ef-ab6b-ad7fb85beea3",
  label: "invoice.txt",
  mimeType: "text/plain",
  bytes: new TextEncoder().encode("Invoice INV-3812"),
  text: "Invoice INV-3812",
};

afterEach(() => {
  if (initialKey === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = initialKey;
  if (initialModel === undefined) delete process.env.OPENAI_EXTRACTION_MODEL;
  else process.env.OPENAI_EXTRACTION_MODEL = initialModel;
  vi.clearAllMocks();
});

describe("recoverable extraction failures", () => {
  it("T24 reports model failure without inventing facts", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    process.env.OPENAI_EXTRACTION_MODEL = "test-model";
    mocks.generateText.mockRejectedValueOnce(new Error("network unavailable"));

    await expect(extractInvoice(input)).resolves.toEqual({
      status: "error",
      error: {
        code: "MODEL_FAILED",
        message: "AI extraction failed. Retry or enter the facts manually.",
        recoverable: true,
      },
    });
  });

  it("reports missing model configuration as recoverable", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    delete process.env.OPENAI_EXTRACTION_MODEL;
    const result = await extractInvoice(input);
    expect(result).toMatchObject({ status: "error", error: { code: "MODEL_NOT_CONFIGURED", recoverable: true } });
    expect(mocks.generateText).not.toHaveBeenCalled();
  });

  it("rejects unsupported evidence before a model call", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    process.env.OPENAI_EXTRACTION_MODEL = "test-model";
    const result = await extractInvoice({ ...input, mimeType: "application/zip" });
    expect(result).toMatchObject({ status: "error", error: { code: "UNSUPPORTED_SOURCE", recoverable: true } });
    expect(mocks.generateText).not.toHaveBeenCalled();
  });
});
