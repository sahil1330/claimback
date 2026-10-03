import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

const ownedCaseSchema = z.object({
  id: z.uuid(),
  user_id: z.uuid(),
});

export class CaseAccessError extends Error {
  constructor() {
    super("Case not found or access denied");
    this.name = "CaseAccessError";
  }
}

/** Recheck ownership before every sensitive case mutation, even with RLS enabled. */
export async function assertCaseOwnership(
  supabase: SupabaseClient,
  caseId: string,
  userId: string,
) {
  const { data, error } = await supabase
    .from("cases")
    .select("id, user_id")
    .eq("id", caseId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw error;
  }
  if (!data) {
    throw new CaseAccessError();
  }
  return ownedCaseSchema.parse(data);
}
