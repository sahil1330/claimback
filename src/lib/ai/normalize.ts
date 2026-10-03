import { z } from "zod";
import {
  agreementFactsSchema,
  invoiceFactsSchema,
  receivedLineSchema,
  receivingFactsSchema,
  type ConfirmationRequest,
  type ExtractionResult,
  type FactUncertainty,
  type SourceEvidence,
} from "../../types/domain";
import {
  agreementModelSchema,
  invoiceModelSchema,
  receivingModelSchema,
} from "./extraction-schemas";
import { parsePrintedRupees } from "./money-text";

export const extractionSourceSchema = z.object({
  artifactId: z.uuid(),
  label: z.string().min(1),
});

export type ExtractionSource = z.infer<typeof extractionSourceSchema>;

function evidence(
  source: ExtractionSource,
  found: { excerpt: string | null; locator: string | null },
): SourceEvidence {
  return {
    sourceArtifactId: source.artifactId,
    sourceLabel: source.label,
    excerpt: found.excerpt?.trim() || null,
    locator: found.locator?.trim() || null,
  };
}

function uncertainties(raw: { field: string; reason: string }[]): FactUncertainty[] {
  return raw
    .map(({ field, reason }) => ({ field: field.trim(), reason: reason.trim() }))
    .filter(({ field, reason }) => field.length > 0 && reason.length > 0);
}

function confirmation(
  requests: ConfirmationRequest[],
  field: string,
  reason: string,
  source: SourceEvidence,
) {
  if (!requests.some((item) => item.field === field && item.reason === reason)) {
    requests.push({ field, reason, source });
  }
}

function addModelUncertainties(
  requests: ConfirmationRequest[],
  raw: FactUncertainty[],
  source: SourceEvidence,
  prefix = "",
) {
  for (const item of raw) {
    confirmation(requests, `${prefix}${item.field}`, item.reason, source);
  }
}

function addLineChecks(
  requests: ConfirmationRequest[],
  source: SourceEvidence,
  confidence: "high" | "medium" | "low",
  index: number,
) {
  if (!source.excerpt && !source.locator) {
    confirmation(requests, `lines.${index}.source`, "No excerpt or locator was found", source);
  }
  if (confidence !== "high") {
    confirmation(requests, `lines.${index}`, confidence === "low" ? "Source text is unclear" : "Source confidence needs merchant review", source);
  }
}

function addTextGroundingChecks(
  requests: ConfirmationRequest[],
  lineSource: SourceEvidence,
  sourceText: string | undefined,
  index: number,
  printedValues: Array<{ field: string; value: string | null }>,
) {
  if (sourceText === undefined) return;
  const normalize = (value: string) => value.normalize("NFKC").replace(/\s+/g, " ").toLocaleLowerCase("en-IN");
  const allText = normalize(sourceText);
  const excerpt = lineSource.excerpt && normalize(lineSource.excerpt);
  if (!excerpt || !allText.includes(excerpt)) {
    confirmation(requests, `lines.${index}.source`, "Excerpt could not be located in the source text", lineSource);
  }
  for (const { field, value } of printedValues) {
    if (value && !allText.includes(normalize(value))) {
      confirmation(requests, `lines.${index}.${field}`, "Extracted value could not be located in the source text", lineSource);
    }
  }
}

function result<T>(facts: T, confirmations: ConfirmationRequest[]): ExtractionResult<T> {
  return confirmations.length === 0
    ? { status: "ready", facts, confirmations: [] }
    : { status: "needs_confirmation", facts, confirmations };
}

function invalidOutput<T>(): ExtractionResult<T> {
  return {
    status: "error",
    error: {
      code: "INVALID_OUTPUT",
      message: "Evidence extraction could not be validated. Retry or enter the facts manually.",
      recoverable: true,
    },
  };
}

export function normalizeInvoiceOutput(raw: unknown, sourceInput: ExtractionSource, sourceText?: string): ExtractionResult<z.infer<typeof invoiceFactsSchema>> {
  const source = extractionSourceSchema.safeParse(sourceInput);
  const parsed = invoiceModelSchema.safeParse(raw);
  if (!source.success || !parsed.success) return invalidOutput();

  const documentSource = evidence(source.data, parsed.data.evidence);
  const confirmations: ConfirmationRequest[] = [];
  const lines = parsed.data.lines.map((line, index) => {
    const lineSource = evidence(source.data, line.evidence);
    const lineUncertainties = uncertainties(line.uncertainties);
    addModelUncertainties(confirmations, lineUncertainties, lineSource, `lines.${index}.`);
    addLineChecks(confirmations, lineSource, line.confidence, index);
    addTextGroundingChecks(confirmations, lineSource, sourceText, index, [
      { field: "rawName", value: line.rawName },
      { field: "skuRef", value: line.skuRef },
      { field: "unitPricePaise", value: line.unitPriceText },
    ]);
    if (line.quantity === null) confirmation(confirmations, `lines.${index}.quantity`, "Invoice quantity is missing or unclear", lineSource);
    if (line.unitPriceText === null) confirmation(confirmations, `lines.${index}.unitPricePaise`, "Invoice rate is missing or unclear", lineSource);
    const unitPricePaise = parsePrintedRupees(line.unitPriceText);
    const discountPaise = parsePrintedRupees(line.discountText);
    if (line.unitPriceText !== null && unitPricePaise === null) confirmation(confirmations, `lines.${index}.unitPricePaise`, "Printed invoice rate could not be parsed", lineSource);
    if (line.discountText !== null && discountPaise === null) confirmation(confirmations, `lines.${index}.discountPaise`, "Printed discount could not be parsed", lineSource);
    return {
      rawName: line.rawName.trim(), skuRef: line.skuRef?.trim() || null,
      unit: line.unit?.trim() || null, packSize: line.packSize?.trim() || null,
      quantity: line.quantity, unitPricePaise, discountPaise,
      source: lineSource, confidence: line.confidence, uncertainties: lineUncertainties,
    };
  });
  if (lines.length === 0) confirmation(confirmations, "lines", "No invoice lines were readable", documentSource);
  if (!parsed.data.invoiceNumber) confirmation(confirmations, "invoiceNumber", "Invoice number is missing or unclear", documentSource);
  if (!parsed.data.supplierName) confirmation(confirmations, "supplierName", "Supplier name is missing or unclear", documentSource);
  addModelUncertainties(confirmations, uncertainties(parsed.data.uncertainties), documentSource);
  const facts = invoiceFactsSchema.safeParse({
    invoiceNumber: parsed.data.invoiceNumber?.trim() || null,
    supplierName: parsed.data.supplierName?.trim() || null,
    source: documentSource, lines, uncertainties: uncertainties(parsed.data.uncertainties),
  });
  if (!facts.success) return invalidOutput();
  return result(facts.data, confirmations);
}

export function normalizeAgreementOutput(raw: unknown, sourceInput: ExtractionSource, sourceText?: string): ExtractionResult<z.infer<typeof agreementFactsSchema>> {
  const source = extractionSourceSchema.safeParse(sourceInput);
  const parsed = agreementModelSchema.safeParse(raw);
  if (!source.success || !parsed.success) return invalidOutput();

  const documentSource = evidence(source.data, parsed.data.evidence);
  const confirmations: ConfirmationRequest[] = [];
  const lines = parsed.data.lines.map((line, index) => {
    const lineSource = evidence(source.data, line.evidence);
    const lineUncertainties = uncertainties(line.uncertainties);
    addModelUncertainties(confirmations, lineUncertainties, lineSource, `lines.${index}.`);
    addLineChecks(confirmations, lineSource, line.confidence, index);
    addTextGroundingChecks(confirmations, lineSource, sourceText, index, [
      { field: "rawName", value: line.rawName },
      { field: "skuRef", value: line.skuRef },
      { field: "unitPricePaise", value: line.unitPriceText },
    ]);
    if (line.quantity === null) confirmation(confirmations, `lines.${index}.quantity`, "Promised quantity is missing or unclear", lineSource);
    if (line.unitPriceText === null) confirmation(confirmations, `lines.${index}.unitPricePaise`, "Agreed rate is missing or unclear", lineSource);
    const unitPricePaise = parsePrintedRupees(line.unitPriceText);
    const discountPaise = parsePrintedRupees(line.discountText);
    if (line.unitPriceText !== null && unitPricePaise === null) confirmation(confirmations, `lines.${index}.unitPricePaise`, "Printed agreed rate could not be parsed", lineSource);
    if (line.discountText !== null && discountPaise === null) confirmation(confirmations, `lines.${index}.discountPaise`, "Printed discount could not be parsed", lineSource);
    return {
      rawName: line.rawName.trim(), skuRef: line.skuRef?.trim() || null,
      unit: line.unit?.trim() || null, packSize: line.packSize?.trim() || null,
      quantity: line.quantity, unitPricePaise, discountPaise, scheme: line.scheme,
      source: lineSource, confidence: line.confidence, uncertainties: lineUncertainties,
    };
  });
  if (lines.length === 0) confirmation(confirmations, "lines", "No promised product lines were readable", documentSource);
  addModelUncertainties(confirmations, uncertainties(parsed.data.uncertainties), documentSource);
  const facts = agreementFactsSchema.safeParse({
    supplierName: parsed.data.supplierName?.trim() || null,
    promiseText: parsed.data.promiseText?.trim() || null,
    source: documentSource, lines, uncertainties: uncertainties(parsed.data.uncertainties),
  });
  if (!facts.success) return invalidOutput();
  return result(facts.data, confirmations);
}

export function normalizeReceivingOutput(raw: unknown, sourceInput: ExtractionSource, sourceText?: string): ExtractionResult<z.infer<typeof receivingFactsSchema>> {
  const source = extractionSourceSchema.safeParse(sourceInput);
  const parsed = receivingModelSchema.safeParse(raw);
  if (!source.success || !parsed.success) return invalidOutput();

  const documentSource = evidence(source.data, parsed.data.evidence);
  const confirmations: ConfirmationRequest[] = [];
  const lines = parsed.data.lines.map((line, index) => {
    const lineSource = evidence(source.data, line.evidence);
    const lineUncertainties = uncertainties(line.uncertainties);
    addModelUncertainties(confirmations, lineUncertainties, lineSource, `lines.${index}.`);
    addLineChecks(confirmations, lineSource, line.confidence, index);
    addTextGroundingChecks(confirmations, lineSource, sourceText, index, [
      { field: "rawName", value: line.rawName },
      { field: "skuRef", value: line.skuRef },
    ]);
    if (line.receivedQuantity === null) confirmation(confirmations, `lines.${index}.receivedQuantity`, "Received quantity is missing or unclear", lineSource);
    if (line.damagedQuantity === null) confirmation(confirmations, `lines.${index}.damagedQuantity`, "Damaged quantity needs merchant confirmation, including zero", lineSource);
    confirmation(confirmations, `lines.${index}.merchantConfirmed`, "Merchant must confirm receiving facts", lineSource);
    return {
      rawName: line.rawName.trim(), skuRef: line.skuRef?.trim() || null,
      unit: line.unit?.trim() || null, packSize: line.packSize?.trim() || null,
      receivedQuantity: line.receivedQuantity, receivedFreeQuantity: line.receivedFreeQuantity,
      damagedQuantity: line.damagedQuantity,
      merchantConfirmed: false, source: lineSource, confidence: line.confidence,
      uncertainties: lineUncertainties,
    };
  });
  if (lines.length === 0) confirmation(confirmations, "lines", "No receiving lines were readable", documentSource);
  addModelUncertainties(confirmations, uncertainties(parsed.data.uncertainties), documentSource);
  const facts = receivingFactsSchema.safeParse({
    source: documentSource, lines, uncertainties: uncertainties(parsed.data.uncertainties),
  });
  if (!facts.success) return invalidOutput();
  return result(facts.data, confirmations);
}

export const confirmedReceivingInputSchema = z.object({
  source: z.object({
    sourceArtifactId: z.uuid(),
    sourceLabel: z.string().min(1),
    excerpt: z.string().nullable(),
    locator: z.string().nullable(),
  }),
  lines: z.array(z.object({
    rawName: z.string().min(1),
    skuRef: z.string().nullable(),
    unit: z.string().nullable(),
    packSize: z.string().nullable(),
    receivedQuantity: z.number().int().nonnegative(),
    receivedFreeQuantity: z.number().int().nonnegative().nullable(),
    damagedQuantity: z.number().int().nonnegative(),
  }).refine((line) => line.damagedQuantity <= line.receivedQuantity, {
    message: "Damaged quantity cannot exceed received quantity",
  })).min(1),
});

/** Only an explicit merchant confirmation can set merchantConfirmed=true. */
export function confirmReceivingInput(input: z.infer<typeof confirmedReceivingInputSchema>) {
  const confirmed = confirmedReceivingInputSchema.parse(input);
  const lines = confirmed.lines.map((line) => receivedLineSchema.parse({
    ...line,
    rawName: line.rawName.trim(),
    skuRef: line.skuRef?.trim() || null,
    merchantConfirmed: true,
    confidence: "high",
    source: confirmed.source,
    uncertainties: [],
  }));
  return receivingFactsSchema.parse({ source: confirmed.source, lines, uncertainties: [] });
}
