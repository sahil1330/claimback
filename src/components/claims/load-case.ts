import "server-only";

import { notFound } from "next/navigation";
import { z } from "zod";
import { requireMerchantPage } from "@/lib/auth/page";
import { supplierResponseSchema } from "@/lib/ai/supplier-response";
import { discrepancySchema } from "@/types/domain";
import { caseStatuses } from "@/components/dashboard/metrics";

const paiseSchema = z.union([z.number().int().nonnegative().safe(), z.string().regex(/^\d+$/)]);
const caseSchema = z.object({
  id: z.uuid(), title: z.string().nullable(), supplier_id: z.uuid().nullable(),
  status: z.enum(caseStatuses), discrepancies: z.array(discrepancySchema),
  potential_recovery_paise: paiseSchema, recovered_paise: paiseSchema, outstanding_paise: paiseSchema,
  merchant_approved_at: z.string().nullable(), claim_sent_at: z.string().nullable(),
});
const messageSchema = z.object({ id: z.uuid(), body: z.string(), parsed: z.unknown().nullable(), created_at: z.string() });
const storedResponseSchema = z.object({ analysis: supplierResponseSchema, responseKind: z.string(), appliedAt: z.string().nullable() });

export type CaseView = {
  id: string;
  title: string | null;
  supplierName: string | null;
  status: z.infer<typeof caseSchema>["status"];
  discrepancies: z.infer<typeof discrepancySchema>[];
  potentialRecoveryPaise: string;
  recoveredPaise: string;
  outstandingPaise: string;
  merchantApprovedAt: string | null;
  claimSentAt: string | null;
  messages: Array<{
    id: string;
    body: string;
    createdAt: string;
    analysis: z.infer<typeof supplierResponseSchema> | null;
  }>;
};

export async function loadCaseView(caseId: string): Promise<CaseView> {
  if (!z.uuid().safeParse(caseId).success) notFound();
  const { supabase, userId } = await requireMerchantPage();
  const { data, error } = await supabase.from("cases")
    .select("id,title,supplier_id,status,discrepancies,potential_recovery_paise,recovered_paise,outstanding_paise,merchant_approved_at,claim_sent_at")
    .eq("id", caseId).eq("user_id", userId).maybeSingle();
  if (error) throw error;
  if (!data) notFound();
  const row = caseSchema.parse(data);
  const [supplierResult, messagesResult] = await Promise.all([
    row.supplier_id
      ? supabase.from("suppliers").select("name").eq("id", row.supplier_id).eq("user_id", userId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase.from("supplier_messages").select("id,body,parsed,created_at")
      .eq("case_id", caseId).eq("user_id", userId).eq("direction", "inbound")
      .order("created_at", { ascending: true }),
  ]);
  if (supplierResult.error) throw supplierResult.error;
  if (messagesResult.error) throw messagesResult.error;
  const messages = z.array(messageSchema).parse(messagesResult.data ?? []).map((message) => {
    const parsed = storedResponseSchema.safeParse(message.parsed);
    return {
      id: message.id, body: message.body, createdAt: message.created_at,
      analysis: parsed.success && parsed.data.appliedAt ? parsed.data.analysis : null,
    };
  });
  return {
    id: row.id, title: row.title, supplierName: supplierResult.data?.name ?? null,
    status: row.status, discrepancies: row.discrepancies,
    potentialRecoveryPaise: String(row.potential_recovery_paise),
    recoveredPaise: String(row.recovered_paise),
    outstandingPaise: String(row.outstanding_paise),
    merchantApprovedAt: row.merchant_approved_at, claimSentAt: row.claim_sent_at,
    messages,
  };
}
