import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

type SafeDetail = string | number | boolean | null;

export type CaseEventInput = {
  caseId: string;
  userId: string;
  eventType: string;
  summary: string;
  status?: "success" | "needs_confirmation" | "error";
  details?: Record<string, SafeDetail>;
};

/** Append a merchant-scoped, display-safe timeline event after ownership is checked. */
export async function appendCaseEvent(
  admin: SupabaseClient,
  input: CaseEventInput,
): Promise<void> {
  const { error } = await admin.from("case_events").insert({
    case_id: input.caseId,
    user_id: input.userId,
    event_type: input.eventType,
    payload: {
      summary: input.summary,
      status: input.status ?? "success",
      ...(input.details ? { details: input.details } : {}),
    },
  });
  if (error) throw error;
}
