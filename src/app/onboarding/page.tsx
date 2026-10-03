import type { Metadata } from "next";
import { ShieldCheck } from "lucide-react";
import { requireMerchantPage } from "@/lib/auth/page";
import { OnboardingForm } from "@/components/auth/onboarding-form";

export const metadata: Metadata = { title: "Set up your business" };

export default async function OnboardingPage() {
  const { supabase, userId } = await requireMerchantPage();
  const { data: profile, error } = await supabase.from("profiles").select("business_name, business_type").eq("id", userId).maybeSingle();
  if (error) throw error;

  return (
    <main className="flex min-h-screen flex-col px-5 py-6 sm:px-8">
      <div className="mx-auto flex w-full max-w-5xl items-center gap-2 text-lg font-bold tracking-tight"><span className="flex size-9 items-center justify-center rounded-xl bg-primary text-white"><ShieldCheck className="size-5" aria-hidden="true" /></span>ClaimBack</div>
      <div className="mx-auto grid w-full max-w-5xl flex-1 items-center gap-10 py-12 lg:grid-cols-2">
        <section>
          <span className="inline-flex rounded-full bg-success-soft px-3 py-1.5 text-xs font-semibold text-primary">Step 1 of 1 · Your business</span>
          <h1 className="mt-5 max-w-lg text-4xl font-semibold tracking-tight sm:text-5xl">Let’s protect the margin behind every sale.</h1>
          <p className="mt-5 max-w-md text-base leading-7 text-muted">Tell us what to call your business. Your receiving, claims and supplier follow-ups will live in one private workspace.</p>
          <div className="mt-8 grid max-w-md gap-3 text-sm text-muted">
            <p><span className="mr-2 font-semibold text-primary">01</span> Check what was promised, billed and received.</p>
            <p><span className="mr-2 font-semibold text-primary">02</span> Approve claims before they are sent.</p>
            <p><span className="mr-2 font-semibold text-primary">03</span> Verify credits before closing a case.</p>
          </div>
        </section>
        <section className="rounded-2xl border border-border bg-surface p-6 shadow-sm sm:p-8">
          <h2 className="text-xl font-semibold">Set up your workspace</h2>
          <p className="mt-2 text-sm text-muted">Just one detail is required to get started.</p>
          <OnboardingForm userId={userId} hasProfile={Boolean(profile)} initialName={profile?.business_name ?? ""} initialType={profile?.business_type ?? ""} />
        </section>
      </div>
    </main>
  );
}
