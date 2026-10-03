import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { requireMerchantPage } from "@/lib/auth/page";
import { AppShell } from "@/components/shared/app-shell";

export default async function ProtectedLayout({ children }: { children: ReactNode }) {
  const { supabase, userId } = await requireMerchantPage();
  const [{ data: profile, error: profileError }, { data: authData }] = await Promise.all([
    supabase.from("profiles").select("business_name").eq("id", userId).maybeSingle(),
    supabase.auth.getUser(),
  ]);

  if (profileError) throw profileError;
  if (!profile?.business_name) redirect("/onboarding");

  return <AppShell businessName={profile.business_name} email={authData.user?.email ?? "Merchant account"}>{children}</AppShell>;
}
