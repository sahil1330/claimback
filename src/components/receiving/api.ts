import { z } from "zod";
import { createClient } from "@/lib/supabase/client";
import {
  agreementFactsSchema,
  confirmationRequestSchema,
  discrepancySchema,
  invoiceFactsSchema,
  receivingFactsSchema,
} from "@/types/domain";
import type { ReconciliationInput } from "@/lib/reconciliation/engine";

const extractionErrorSchema = z.object({
  status: z.literal("error"),
  error: z.object({ code: z.string(), message: z.string(), recoverable: z.literal(true) }),
});

function extractionSchema<T extends z.ZodType>(facts: T) {
  return z.discriminatedUnion("status", [
    z.object({ status: z.literal("ready"), facts, confirmations: z.tuple([]) }),
    z.object({ status: z.literal("needs_confirmation"), facts, confirmations: z.array(confirmationRequestSchema) }),
    extractionErrorSchema,
  ]);
}

const invoiceResultSchema = extractionSchema(invoiceFactsSchema);
const agreementResultSchema = extractionSchema(agreementFactsSchema);
const receivingResultSchema = extractionSchema(receivingFactsSchema);
const createCaseResponseSchema = z.object({ case: z.object({ id: z.uuid() }) });
const uploadResponseSchema = z.object({ artifact: z.object({ artifactId: z.uuid(), label: z.string() }) });
const reconcileResponseSchema = z.discriminatedUnion("outcome", [
  z.object({ outcome: z.literal("needs_confirmation"), message: z.string(), confirmations: z.array(confirmationRequestSchema) }),
  z.object({ outcome: z.literal("clean"), message: z.string(), discrepancies: z.tuple([]) }),
  z.object({ outcome: z.literal("discrepancy"), message: z.string(), discrepancies: z.array(discrepancySchema), totalPotentialRecoveryPaise: z.number().int().safe() }),
]);

async function responseJson(response: Response): Promise<unknown> {
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const parsed = z.object({ error: z.string() }).safeParse(body);
    throw new Error(parsed.success ? parsed.data.error : `Request failed (${response.status})`);
  }
  return body;
}

async function postJson(url: string, body: unknown): Promise<unknown> {
  return responseJson(await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }));
}

export async function createReceivingCase(supplierName: string) {
  const { data, error } = await createClient().from("suppliers")
    .select("id")
    .eq("name", supplierName)
    .limit(1)
    .maybeSingle();
  if (error) throw new Error("Could not look up the supplier. Retry in a moment.");
  const result = await postJson("/api/cases", {
    title: "New receiving",
    ...(data?.id ? { supplierId: data.id } : { supplierName }),
  });
  return createCaseResponseSchema.parse(result).case.id;
}

export async function uploadReceivingEvidence(caseId: string, type: "invoice" | "agreement" | "other", file: File) {
  const form = new FormData();
  form.set("caseId", caseId);
  form.set("type", type);
  form.set("file", file);
  const result = await responseJson(await fetch("/api/evidence", { method: "POST", body: form }));
  return uploadResponseSchema.parse(result).artifact;
}

async function extract(caseId: string, artifactId: string): Promise<unknown> {
  return postJson("/api/evidence/extract", { caseId, artifactId });
}

export async function extractInvoice(caseId: string, artifactId: string) {
  return invoiceResultSchema.parse(await extract(caseId, artifactId));
}

export async function extractAgreement(caseId: string, artifactId: string) {
  return agreementResultSchema.parse(await extract(caseId, artifactId));
}

export async function extractReceiving(caseId: string, artifactId: string) {
  return receivingResultSchema.parse(await extract(caseId, artifactId));
}

type SourceConfirmationSubmission = {
  acknowledgments: Array<{ field: string; reason: string }>;
  corrections: Record<string, string | number | { buyQuantity: number; freeQuantity: number } | null>;
};

async function confirmSource(caseId: string, artifactId: string, submission: SourceConfirmationSubmission): Promise<unknown> {
  return postJson("/api/evidence/confirm", { caseId, artifactId, ...submission });
}

export async function confirmInvoiceSource(caseId: string, artifactId: string, submission: SourceConfirmationSubmission) {
  return invoiceResultSchema.parse(await confirmSource(caseId, artifactId, submission));
}

export async function confirmAgreementSource(caseId: string, artifactId: string, submission: SourceConfirmationSubmission) {
  return agreementResultSchema.parse(await confirmSource(caseId, artifactId, submission));
}

export async function reconcileReceiving(caseId: string, input: ReconciliationInput) {
  await postJson(`/api/cases/${caseId}/facts`, input);
  return reconcileResponseSchema.parse(await postJson(`/api/cases/${caseId}/reconcile`, {}));
}
