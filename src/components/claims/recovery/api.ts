import { z } from "zod";

const paiseSchema = z.number().int().safe().nonnegative();

const obligationSchema = z.object({
  id: z.uuid(),
  original_amount_paise: paiseSchema,
  recovered_paise: paiseSchema,
  outstanding_paise: paiseSchema,
  promise_text: z.string().nullable(),
  promised_for: z.string().nullable(),
  status: z.enum(["OPEN", "PARTIALLY_RECOVERED", "RECOVERED", "DISPUTED"]),
  created_at: z.string(),
  resolved_at: z.string().nullable(),
});

const evidenceSchema = z.object({
  source: z.object({
    sourceArtifactId: z.uuid(),
    sourceLabel: z.string(),
    excerpt: z.string().nullable(),
    locator: z.string().nullable(),
  }),
  explicitAmountPaise: paiseSchema.nullable(),
  referenceText: z.string().nullable(),
  evidenceType: z.enum(["credit_note", "invoice_credit", "invoice_no_credit"]),
  uncertainties: z.array(z.string()),
});

const historySchema = z.object({
  obligations: z.array(obligationSchema),
  verifications: z.array(z.object({
    artifact_id: z.uuid(),
    credit_paise: paiseSchema,
    applied_paise: paiseSchema,
    outcome: z.enum(["missing", "partial", "full"]),
    evidence: evidenceSchema,
    created_at: z.string(),
  })),
});

const verifyResultSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("verified"),
    evidence: evidenceSchema,
    verification: z.object({
      artifactId: z.uuid(),
      caseId: z.uuid(),
      creditPaise: paiseSchema,
      appliedPaise: paiseSchema,
      outstandingPaise: paiseSchema,
      caseState: z.string(),
      outcome: z.enum(["missing", "partial", "full"]),
      alreadyApplied: z.boolean(),
    }),
  }),
  z.object({
    status: z.literal("needs_confirmation"),
    evidence: evidenceSchema,
    confirmations: z.array(z.string()).min(1),
    obligationIds: z.array(z.uuid()).optional(),
  }),
  z.object({
    status: z.literal("error"),
    error: z.object({ code: z.string(), message: z.string(), recoverable: z.literal(true) }),
  }),
]);

const uploadSchema = z.object({ artifact: z.object({ artifactId: z.uuid(), label: z.string() }) });
const errorSchema = z.object({ error: z.string() });

export type RecoveryHistory = z.infer<typeof historySchema>;
export type RecoveryResult = z.infer<typeof verifyResultSchema>;
export type RecoveryObligation = RecoveryHistory["obligations"][number];

async function responseBody(response: Response): Promise<unknown> {
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = errorSchema.safeParse(body);
    throw new Error(error.success ? error.data.error : `Request failed (${response.status})`);
  }
  return body;
}

export async function loadRecoveryHistory(caseId: string): Promise<RecoveryHistory> {
  const response = await fetch(`/api/cases/${encodeURIComponent(caseId)}/recovery`, { cache: "no-store" });
  return historySchema.parse(await responseBody(response));
}

export async function uploadRecoveryEvidence(caseId: string, type: "credit_note" | "corrected_invoice", file: File) {
  const form = new FormData();
  form.set("caseId", caseId);
  form.set("type", type);
  form.set("file", file);
  const response = await fetch("/api/evidence", { method: "POST", body: form });
  return uploadSchema.parse(await responseBody(response)).artifact;
}

export async function verifyRecoveryEvidence(input: {
  caseId: string;
  artifactId: string;
  obligationIds?: string[];
  merchantConfirmedLink?: boolean;
}): Promise<RecoveryResult> {
  const response = await fetch(`/api/cases/${encodeURIComponent(input.caseId)}/recovery`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      artifactId: input.artifactId,
      ...(input.obligationIds?.length ? { obligationIds: input.obligationIds } : {}),
      ...(input.merchantConfirmedLink ? { merchantConfirmedLink: true } : {}),
    }),
  });
  return verifyResultSchema.parse(await responseBody(response));
}
