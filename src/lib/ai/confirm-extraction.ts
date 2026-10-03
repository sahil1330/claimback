import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import {
  agreementFactsSchema,
  confirmationRequestSchema,
  invoiceFactsSchema,
  type AgreementFacts,
  type InvoiceFacts,
} from "../../types/domain";

const acknowledgmentSchema = z.object({
  field: z.string().min(1).max(200),
  reason: z.string().min(1).max(500),
}).strict();

export const confirmExtractionInputSchema = z.object({
  caseId: z.uuid(),
  artifactId: z.uuid(),
  acknowledgments: z.array(acknowledgmentSchema).min(1).max(100),
  corrections: z.record(z.string().min(1).max(200), z.unknown()),
}).strict();

export type ConfirmExtractionInput = z.infer<typeof confirmExtractionInputSchema>;
export type ConfirmableType = "invoice" | "agreement";

export class ConfirmationError extends Error {
  constructor(message: string, readonly status: 400 | 409 | 422 = 422) {
    super(message);
    this.name = "ConfirmationError";
  }
}

const lineFields = new Set([
  "rawName", "skuRef", "unit", "packSize", "quantity",
  "unitPricePaise", "discountPaise", "scheme",
]);
const invoiceFields = new Set(["invoiceNumber", "supplierName"]);
const agreementFields = new Set(["supplierName", "promiseText"]);

type Facts = InvoiceFacts | AgreementFacts;
type Change = { path: string; before: unknown; after: unknown };

function uniqueKeys(items: { field: string; reason: string }[]) {
  return new Set(items.map(({ field, reason }) => JSON.stringify([field, reason])));
}

function checkAcknowledgments(
  requested: ConfirmExtractionInput["acknowledgments"],
  saved: { field: string; reason: string }[],
) {
  const expected = uniqueKeys(saved);
  const supplied = uniqueKeys(requested);
  if (supplied.size !== requested.length || supplied.size !== expected.size ||
      [...expected].some((key) => !supplied.has(key))) {
    throw new ConfirmationError("Review and confirm every flagged field from the latest extraction", 409);
  }
}

function canonicalField(field: string) {
  return field.replace(/\.unitPriceText$/, ".unitPricePaise")
    .replace(/\.discountText$/, ".discountPaise");
}

function allowedCorrection(path: string, flags: Set<string>, type: ConfirmableType, lineCount: number) {
  if ((type === "invoice" ? invoiceFields : agreementFields).has(path)) return flags.has(path);
  const match = /^lines\.(\d+)\.(.+)$/.exec(path);
  if (!match) return false;
  const index = Number(match[1]);
  const field = match[2];
  if (!Number.isSafeInteger(index) || index >= lineCount) return false;
  const base = `lines.${index}`;
  if (field === "source.locator") return flags.has(`${base}.source`);
  if (!lineFields.has(field) || (field === "scheme" && type !== "agreement")) return false;
  return flags.has(base) || flags.has(`${base}.${field}`) ||
    (field === "scheme" && [...flags].some((flag) => flag.startsWith(`${base}.scheme.`)));
}

function applyChange(facts: Facts, path: string, value: unknown): Change {
  const parts = path.split(".");
  let target: Record<string, unknown> = facts as unknown as Record<string, unknown>;
  if (parts[0] === "lines") {
    target = facts.lines[Number(parts[1])] as unknown as Record<string, unknown>;
    parts.splice(0, 2);
  }
  if (parts[0] === "source") {
    target = target.source as Record<string, unknown>;
    parts.shift();
  }
  const field = parts[0];
  const before = target[field];
  if (isDeepStrictEqual(before, value)) {
    throw new ConfirmationError(`Correction for ${path} is unchanged; omit it or edit its value`, 400);
  }
  target[field] = value;
  return { path, before, after: value };
}

/** Apply only merchant-reviewed changes to a persisted uncertain extraction. */
export function prepareConfirmedExtraction(
  stored: unknown,
  type: ConfirmableType,
  artifactId: string,
  input: ConfirmExtractionInput,
  actorId: string,
  confirmedAt: string,
) {
  const factSchema = type === "invoice" ? invoiceFactsSchema : agreementFactsSchema;
  const parsed = z.object({
    status: z.literal("needs_confirmation"),
    facts: factSchema,
    confirmations: z.array(confirmationRequestSchema).min(1),
  }).safeParse(stored);
  if (!parsed.success) throw new ConfirmationError("The latest extraction is not awaiting confirmation", 409);
  const original = parsed.data;
  if (original.facts.source.sourceArtifactId !== artifactId ||
      original.facts.lines.some((line) => line.source.sourceArtifactId !== artifactId) ||
      original.confirmations.some((item) => item.source.sourceArtifactId !== artifactId)) {
    throw new ConfirmationError("Extraction source does not match this artifact", 409);
  }
  checkAcknowledgments(input.acknowledgments, original.confirmations);
  if (original.facts.lines.length === 0) {
    throw new ConfirmationError("No product lines were readable; upload clearer evidence and extract again");
  }

  const flags = new Set(original.confirmations.map((item) => canonicalField(item.field)));
  const facts = structuredClone(original.facts) as Facts;
  const changes: Change[] = [];
  for (const [path, value] of Object.entries(input.corrections)) {
    if (!allowedCorrection(path, flags, type, facts.lines.length)) {
      throw new ConfirmationError(`Correction for ${path} was not requested by the extraction`, 400);
    }
    changes.push(applyChange(facts, path, value));
  }

  // Promote only lines explicitly flagged for confidence review. Every model
  // uncertainty must also have its own saved request or a whole-line request.
  for (const uncertainty of facts.uncertainties) {
    if (!flags.has(canonicalField(uncertainty.field))) {
      throw new ConfirmationError(`Unreviewed document uncertainty: ${uncertainty.field}`, 409);
    }
  }
  facts.uncertainties = [];
  for (const [index, line] of facts.lines.entries()) {
    const base = `lines.${index}`;
    if (line.confidence !== "high" && !flags.has(base)) {
      throw new ConfirmationError(`Line ${index + 1} needs explicit confidence review; extract again`, 409);
    }
    for (const uncertainty of line.uncertainties) {
      if (!flags.has(base) && !flags.has(canonicalField(`${base}.${uncertainty.field}`))) {
        throw new ConfirmationError(`Unreviewed uncertainty on line ${index + 1}; extract again`, 409);
      }
    }
    if (flags.has(base)) line.confidence = "high";
    line.uncertainties = [];
  }
  const validated = factSchema.safeParse(facts);
  if (!validated.success) throw new ConfirmationError("A corrected value has the wrong format", 400);
  if (validated.data.lines.some((line) => line.quantity === null || line.unitPricePaise === null ||
      (!line.source.excerpt && !line.source.locator))) {
    throw new ConfirmationError("Confirm each product quantity, rate, and evidence location before continuing");
  }
  const result = { status: "ready" as const, facts: validated.data, confirmations: [] as [] };
  const audit = {
    actorId,
    confirmedAt,
    acknowledgments: input.acknowledgments,
    changes,
    originalFacts: original.facts,
    originalConfirmations: original.confirmations,
  };
  return { result, audit, stored: { ...result, confirmationAudit: audit } };
}
