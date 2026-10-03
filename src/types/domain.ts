import { z } from "zod";

export const sourceEvidenceSchema = z.object({
  sourceArtifactId: z.uuid(),
  sourceLabel: z.string().min(1),
  excerpt: z.string().nullable(),
  locator: z.string().nullable(),
});

export const factUncertaintySchema = z.object({
  field: z.string().min(1),
  reason: z.string().min(1),
});

const sourceLineSchema = z.object({
  rawName: z.string().min(1),
  skuRef: z.string().nullable(),
  unit: z.string().nullable(),
  packSize: z.string().nullable(),
  source: sourceEvidenceSchema,
  confidence: z.enum(["high", "medium", "low"]),
  uncertainties: z.array(factUncertaintySchema),
});

export const schemeSchema = z.object({
  buyQuantity: z.number().int().positive(),
  freeQuantity: z.number().int().positive(),
});

export const promisedLineSchema = sourceLineSchema.extend({
  quantity: z.number().int().nonnegative().nullable(),
  unitPricePaise: z.number().int().nonnegative().safe().nullable(),
  discountPaise: z.number().int().nonnegative().safe().nullable(),
  scheme: schemeSchema.nullable(),
});

export const billedLineSchema = sourceLineSchema.extend({
  quantity: z.number().int().nonnegative().nullable(),
  unitPricePaise: z.number().int().nonnegative().safe().nullable(),
  discountPaise: z.number().int().nonnegative().safe().nullable(),
});

export const receivedLineSchema = sourceLineSchema.extend({
  receivedQuantity: z.number().int().nonnegative().nullable(),
  /** Free scheme units counted separately from paid units. */
  receivedFreeQuantity: z.number().int().nonnegative().nullable(),
  damagedQuantity: z.number().int().nonnegative().nullable(),
  merchantConfirmed: z.boolean(),
}).refine(
  (line) => line.receivedQuantity === null || line.damagedQuantity === null ||
    line.damagedQuantity <= line.receivedQuantity,
  { message: "Damaged quantity cannot exceed received quantity" },
);

export const invoiceFactsSchema = z.object({
  invoiceNumber: z.string().nullable(),
  supplierName: z.string().nullable(),
  source: sourceEvidenceSchema,
  lines: z.array(billedLineSchema),
  uncertainties: z.array(factUncertaintySchema),
});

export const agreementFactsSchema = z.object({
  supplierName: z.string().nullable(),
  promiseText: z.string().nullable(),
  source: sourceEvidenceSchema,
  lines: z.array(promisedLineSchema),
  uncertainties: z.array(factUncertaintySchema),
});

export const receivingFactsSchema = z.object({
  source: sourceEvidenceSchema,
  lines: z.array(receivedLineSchema),
  uncertainties: z.array(factUncertaintySchema),
});

export const confirmationRequestSchema = z.object({
  field: z.string().min(1),
  reason: z.string().min(1),
  source: sourceEvidenceSchema,
});

export const discrepancySchema = z.object({
  id: z.string().min(1),
  type: z.enum(["SHORT_DELIVERY", "RATE_MISMATCH", "MISSING_SCHEME_UNITS", "DAMAGED_GOODS"]),
  skuRef: z.string().min(1),
  description: z.string().min(1),
  affectedQuantity: z.number().int().positive(),
  expectedUnitPricePaise: z.number().int().nonnegative().safe(),
  billedUnitPricePaise: z.number().int().nonnegative().safe(),
  amountPaise: z.number().int().positive().safe(),
  calculation: z.object({
    kind: z.enum(["short_delivery", "rate_mismatch", "missing_scheme_units", "damaged_goods"]),
    inputs: z.record(z.string(), z.number().int().nonnegative().safe()),
  }),
  promisedEvidence: sourceEvidenceSchema,
  billedEvidence: sourceEvidenceSchema,
  receivedEvidence: sourceEvidenceSchema,
  confidence: z.literal("high"),
  status: z.literal("supported"),
});

export type SourceEvidence = z.infer<typeof sourceEvidenceSchema>;
export type FactUncertainty = z.infer<typeof factUncertaintySchema>;
export type Scheme = z.infer<typeof schemeSchema>;
export type PromisedLine = z.infer<typeof promisedLineSchema>;
export type BilledLine = z.infer<typeof billedLineSchema>;
export type ReceivedLine = z.infer<typeof receivedLineSchema>;
export type InvoiceFacts = z.infer<typeof invoiceFactsSchema>;
export type AgreementFacts = z.infer<typeof agreementFactsSchema>;
export type ReceivingFacts = z.infer<typeof receivingFactsSchema>;
export type ConfirmationRequest = z.infer<typeof confirmationRequestSchema>;
export type Discrepancy = z.infer<typeof discrepancySchema>;

export type ExtractionResult<T> =
  | { status: "ready"; facts: T; confirmations: [] }
  | { status: "needs_confirmation"; facts: T; confirmations: ConfirmationRequest[] }
  | { status: "error"; error: { code: "MODEL_NOT_CONFIGURED" | "MODEL_FAILED" | "INVALID_OUTPUT" | "UNSUPPORTED_SOURCE"; message: string; recoverable: true } };
