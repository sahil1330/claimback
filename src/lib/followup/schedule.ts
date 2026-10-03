import "server-only";
import { z } from "zod";
import { requireMerchant } from "../auth/session";
import { assertCaseOwnership } from "../auth/case-access";
import { createAdminClient } from "../supabase/admin";
import { appendCaseEvent } from "../cases/events";

export const followupReasonSchema = z.enum([
  "awaiting_supplier_response",
  "promised_credit",
  "missing_credit",
  "partial_credit",
  "manual_review",
]);

export const scheduleFollowupSchema = z.object({
  scheduledFor: z.iso.datetime({ offset: true }),
  reason: followupReasonSchema,
}).strict();

const schedulableStates = new Set([
  "CLAIM_SENT", "AWAITING_SUPPLIER", "SUPPLIER_RESPONDED",
  "AWAITING_RECOVERY", "RECOVERY_VERIFICATION", "ESCALATED",
]);
const maximumDelayMs = 90 * 24 * 60 * 60 * 1000;

export class FollowupScheduleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FollowupScheduleError";
  }
}

export function parseFollowupRequest(input: unknown, now = Date.now()) {
  const parsed = scheduleFollowupSchema.parse(input);
  const timestamp = Date.parse(parsed.scheduledFor);
  if (!Number.isFinite(timestamp) || timestamp <= now) {
    throw new FollowupScheduleError("Choose a future follow-up time");
  }
  if (timestamp - now > maximumDelayMs) {
    throw new FollowupScheduleError("Choose a follow-up time within 90 days");
  }
  return { scheduledFor: new Date(timestamp).toISOString(), reason: parsed.reason };
}

/** Scheduling changes only reminder metadata, never claim state or money. */
export async function scheduleCaseFollowup(caseId: string, input: unknown) {
  z.uuid().parse(caseId);
  const { scheduledFor, reason } = parseFollowupRequest(input);
  const { supabase, userId } = await requireMerchant();
  await assertCaseOwnership(supabase, caseId, userId);
  const admin = createAdminClient();
  const { data: current, error: readError } = await admin.from("cases")
    .select("status, claim_sent_at, outstanding_paise, next_follow_up_at")
    .eq("id", caseId).eq("user_id", userId).single();
  if (readError) throw readError;
  if (!current || !current.claim_sent_at || !schedulableStates.has(current.status) ||
    Number(current.outstanding_paise) <= 0) {
    throw new FollowupScheduleError("Only a sent claim with outstanding recovery can have a follow-up");
  }

  const previous = current.next_follow_up_at;
  const { data: updated, error: updateError } = await admin.from("cases")
    .update({ next_follow_up_at: scheduledFor, updated_at: new Date().toISOString() })
    .eq("id", caseId).eq("user_id", userId).eq("status", current.status)
    .gt("outstanding_paise", 0)
    .select("next_follow_up_at").maybeSingle();
  if (updateError) throw updateError;
  if (!updated) throw new FollowupScheduleError("Case changed while scheduling; retry");
  try {
    await appendCaseEvent(admin, {
      caseId, userId, eventType: "followup_scheduled",
      summary: "Follow-up scheduled for outstanding supplier claim",
      details: { scheduledFor, reason },
    });
  } catch (error) {
    // Keep the reason and date together if event persistence fails. The guard
    // prevents this rollback from overwriting a newer schedule.
    await admin.from("cases").update({ next_follow_up_at: previous })
      .eq("id", caseId).eq("user_id", userId).eq("next_follow_up_at", scheduledFor);
    throw error;
  }
  return { caseId, scheduledFor, reason };
}

const eventDetailsSchema = z.object({
  details: z.object({ scheduledFor: z.string(), reason: followupReasonSchema }),
});

export async function readCaseFollowup(caseId: string) {
  z.uuid().parse(caseId);
  const { supabase, userId } = await requireMerchant();
  await assertCaseOwnership(supabase, caseId, userId);
  const { data: current, error: caseError } = await supabase.from("cases")
    .select("status, outstanding_paise, next_follow_up_at")
    .eq("id", caseId).eq("user_id", userId).single();
  if (caseError) throw caseError;
  if (!current?.next_follow_up_at || !schedulableStates.has(current.status) ||
    Number(current.outstanding_paise) <= 0) return { followup: null };
  const { data: events, error: eventError } = await supabase.from("case_events")
    .select("payload").eq("case_id", caseId).eq("user_id", userId)
    .eq("event_type", "followup_scheduled")
    .order("id", { ascending: false }).limit(1);
  if (eventError) throw eventError;
  const event = eventDetailsSchema.safeParse(events?.[0]?.payload);
  return { followup: {
    scheduledFor: current.next_follow_up_at,
    reason: event.success && Date.parse(event.data.details.scheduledFor) === Date.parse(current.next_follow_up_at)
      ? event.data.details.reason : null,
  } };
}
