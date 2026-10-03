"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, LoaderCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const businessTypes = [
  { value: "pharmacy", label: "Pharmacy" },
  { value: "fmcg", label: "FMCG retailer" },
  { value: "cosmetics", label: "Cosmetics retailer" },
  { value: "electronics", label: "Electronics or accessories" },
  { value: "wholesale", label: "Wholesaler" },
  { value: "other", label: "Other" },
] as const;

export function OnboardingForm({ userId, hasProfile, initialName = "", initialType = "" }: { userId: string; hasProfile: boolean; initialName?: string; initialType?: string }) {
  const router = useRouter();
  const [businessName, setBusinessName] = useState(initialName);
  const [businessType, setBusinessType] = useState(initialType);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = businessName.trim();
    if (!name) {
      setError("Enter your business name to continue.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const profileData = {
        business_name: name,
        business_type: businessType || null,
        preferred_locale: "en-IN",
      };
      const query = createClient().from("profiles");
      const { error: saveError } = hasProfile
        ? await query.update(profileData).eq("id", userId)
        : await query.insert({ id: userId, ...profileData });
      if (saveError) throw saveError;
      router.replace("/app");
      router.refresh();
    } catch (cause) {
      const message = cause && typeof cause === "object" && "message" in cause && typeof cause.message === "string"
        ? cause.message
        : "Could not save your business. Please try again.";
      setError(message);
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} aria-busy={pending} className="mt-8 space-y-5">
      <div className="space-y-2">
        <label htmlFor="business-name" className="block text-sm font-medium">Business name <span className="text-danger">*</span></label>
        <Input id="business-name" autoComplete="organization" maxLength={120} required value={businessName} onChange={(event) => setBusinessName(event.target.value)} placeholder="e.g. Sharma Medical" />
      </div>
      <div className="space-y-2">
        <label htmlFor="business-type" className="block text-sm font-medium">What kind of business do you run?</label>
        <select id="business-type" value={businessType} onChange={(event) => setBusinessType(event.target.value)} className="h-11 w-full rounded-lg border border-border bg-surface px-3.5 text-sm text-foreground shadow-sm focus-visible:border-primary focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary">
          <option value="">Choose a type (optional)</option>
          {businessTypes.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
        </select>
      </div>
      {error && <p role="alert" className="rounded-lg border border-danger/20 bg-danger-soft px-3.5 py-3 text-sm text-danger">{error}</p>}
      <Button type="submit" size="lg" disabled={pending} className="w-full">
        {pending ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : null}
        Open my workspace
        {!pending && <ArrowRight aria-hidden="true" />}
      </Button>
      <p className="text-center text-xs leading-5 text-muted">You can add suppliers and deliveries after this step.</p>
    </form>
  );
}
