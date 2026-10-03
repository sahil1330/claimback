import { createClient } from "@/lib/supabase/server";

export class AuthenticationRequiredError extends Error {
  constructor() {
    super("Authentication required");
    this.name = "AuthenticationRequiredError";
  }
}

export async function requireMerchant() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;

  if (error || !userId) {
    throw new AuthenticationRequiredError();
  }

  return { supabase, userId };
}
