import { z } from "zod";
import { createClient } from "@/lib/supabase/client";

const eventSchema = z.object({
  id: z.number().int().safe(),
  event_type: z.string(),
  created_at: z.string(),
});

const safeLabels: Record<string, string> = {
  evidence_captured: "Invoice, promise and receiving facts captured",
  reconciliation_needs_confirmation: "Facts need merchant confirmation",
  case_reconciled: "Delivery checked against its sources",
  claim_drafted: "Evidence packet created",
  merchant_approval_pending: "Waiting for merchant approval",
  merchant_approved: "Merchant approved the claim",
  claim_sent: "Claim sent",
  supplier_no_response: "No supplier response yet",
  supplier_response_received: "Supplier response received",
  supplier_promise_recorded: "Recovery promise recorded; verification pending",
  recovery_evidence_needs_confirmation: "Recovery evidence needs confirmation",
  recovery_evidence_checked: "New recovery evidence checked",
  credit_verified: "Credit verified",
  recovery_outstanding: "Balance remains outstanding",
  case_closed: "Case closed after verified recovery",
};

export type VisibleEvent = { id: number; label: string; createdAt: string };

export async function loadVisibleEvents(caseId: string): Promise<VisibleEvent[]> {
  const { data, error } = await createClient().from("case_events")
    .select("id,event_type,created_at")
    .eq("case_id", caseId)
    .order("created_at", { ascending: true })
    .limit(100);
  if (error) throw new Error("Could not load the action timeline.");
  return z.array(eventSchema).parse(data ?? [])
    .filter((event) => safeLabels[event.event_type])
    .map((event) => ({ id: event.id, label: safeLabels[event.event_type], createdAt: event.created_at }));
}
