import { z } from "zod";

const modelEvidenceSchema = z.object({
  excerpt: z.string().nullable(),
  locator: z.string().nullable(),
});

const modelUncertaintySchema = z.object({
  field: z.string(),
  reason: z.string(),
});

const modelLineBaseSchema = z.object({
  rawName: z.string(),
  skuRef: z.string().nullable(),
  unit: z.string().nullable(),
  packSize: z.string().nullable(),
  confidence: z.enum(["high", "medium", "low"]),
  evidence: modelEvidenceSchema,
  uncertainties: z.array(modelUncertaintySchema),
});

export const invoiceModelSchema = z.object({
  invoiceNumber: z.string().nullable(),
  supplierName: z.string().nullable(),
  evidence: modelEvidenceSchema,
  lines: z.array(modelLineBaseSchema.extend({
    quantity: z.number().int().nonnegative().nullable(),
    unitPriceText: z.string().nullable(),
    discountText: z.string().nullable(),
  })),
  uncertainties: z.array(modelUncertaintySchema),
});

export const agreementModelSchema = z.object({
  supplierName: z.string().nullable(),
  promiseText: z.string().nullable(),
  evidence: modelEvidenceSchema,
  lines: z.array(modelLineBaseSchema.extend({
    quantity: z.number().int().nonnegative().nullable(),
    unitPriceText: z.string().nullable(),
    discountText: z.string().nullable(),
    scheme: z.object({
      buyQuantity: z.number().int().positive(),
      freeQuantity: z.number().int().positive(),
    }).nullable(),
  })),
  uncertainties: z.array(modelUncertaintySchema),
});

export const receivingModelSchema = z.object({
  evidence: modelEvidenceSchema,
  lines: z.array(modelLineBaseSchema.extend({
    receivedQuantity: z.number().int().nonnegative().nullable(),
    damagedQuantity: z.number().int().nonnegative().nullable(),
  })),
  uncertainties: z.array(modelUncertaintySchema),
});
