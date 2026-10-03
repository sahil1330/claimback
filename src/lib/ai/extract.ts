import "server-only";
import { generateText, Output, type UserContent } from "ai";
import { z } from "zod";
import type { AgreementFacts, ExtractionResult, InvoiceFacts, ReceivingFacts } from "../../types/domain";
import { agreementModelSchema, invoiceModelSchema, receivingModelSchema } from "./extraction-schemas";
import { extractionModel, ModelConfigurationError } from "./models";
import {
  normalizeAgreementOutput,
  normalizeInvoiceOutput,
  normalizeReceivingOutput,
  type ExtractionSource,
} from "./normalize";
import { agreementExtractorPrompt } from "./prompts/agreement-extractor";
import { invoiceExtractorPrompt } from "./prompts/invoice-extractor";
import { receivingParserPrompt } from "./prompts/receiving-parser";

export type ExtractionInput = ExtractionSource & {
  mimeType: string;
  bytes: Uint8Array;
  text?: string;
};

function modelContent(input: ExtractionInput): UserContent | null {
  const label = `Artifact ${input.artifactId}: ${input.label}`;
  if (input.mimeType.startsWith("text/")) {
    return `${label}\n\n${input.text ?? new TextDecoder().decode(input.bytes)}`;
  }
  if (input.mimeType === "application/pdf") {
    return [
      { type: "text", text: label },
      { type: "file", data: input.bytes, mediaType: "application/pdf" },
    ];
  }
  if (["image/png", "image/jpeg", "image/webp"].includes(input.mimeType)) {
    return [
      { type: "text", text: label },
      { type: "file", data: input.bytes, mediaType: input.mimeType },
    ];
  }
  return null;
}

async function structuredOutput<S extends z.ZodType>(
  input: ExtractionInput,
  instructions: string,
  schema: S,
): Promise<z.output<S>> {
  const content = modelContent(input);
  if (content === null) throw new UnsupportedSourceError();
  const { output } = await generateText({
    model: extractionModel(),
    output: Output.object({ schema }),
    system: instructions,
    messages: [{ role: "user", content }],
    maxRetries: 1,
  });
  return schema.parse(output);
}

class UnsupportedSourceError extends Error {
  constructor() {
    super("Only text, PDF, PNG, JPEG, and WebP evidence can be extracted");
    this.name = "UnsupportedSourceError";
  }
}

function recoverableError<T>(error: unknown): ExtractionResult<T> {
  if (error instanceof ModelConfigurationError) {
    return {
      status: "error",
      error: { code: "MODEL_NOT_CONFIGURED", message: "AI extraction is not configured. Enter facts manually or retry after setup.", recoverable: true },
    };
  }
  if (error instanceof UnsupportedSourceError) {
    return {
      status: "error",
      error: { code: "UNSUPPORTED_SOURCE", message: error.message, recoverable: true },
    };
  }
  return {
    status: "error",
    error: { code: "MODEL_FAILED", message: "AI extraction failed. Retry or enter the facts manually.", recoverable: true },
  };
}

export async function extractInvoice(input: ExtractionInput): Promise<ExtractionResult<InvoiceFacts>> {
  try {
    const output = await structuredOutput(input, invoiceExtractorPrompt, invoiceModelSchema);
    return normalizeInvoiceOutput(output, input, input.mimeType.startsWith("text/") ? input.text ?? new TextDecoder().decode(input.bytes) : undefined);
  } catch (error) {
    return recoverableError(error);
  }
}

export async function extractAgreement(input: ExtractionInput): Promise<ExtractionResult<AgreementFacts>> {
  try {
    const output = await structuredOutput(input, agreementExtractorPrompt, agreementModelSchema);
    return normalizeAgreementOutput(output, input, input.mimeType.startsWith("text/") ? input.text ?? new TextDecoder().decode(input.bytes) : undefined);
  } catch (error) {
    return recoverableError(error);
  }
}

export async function parseReceiving(input: ExtractionInput): Promise<ExtractionResult<ReceivingFacts>> {
  try {
    const output = await structuredOutput(input, receivingParserPrompt, receivingModelSchema);
    return normalizeReceivingOutput(output, input, input.mimeType.startsWith("text/") ? input.text ?? new TextDecoder().decode(input.bytes) : undefined);
  } catch (error) {
    return recoverableError(error);
  }
}
