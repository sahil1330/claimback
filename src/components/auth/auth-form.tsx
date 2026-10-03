"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, LoaderCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Mode = "login" | "signup";

export function AuthForm({ mode, callbackError = false }: { mode: Mode; callbackError?: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(callbackError ? "That sign-in link could not be verified. Please sign in again." : null);
  const [message, setMessage] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);

    if (mode === "signup" && password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setPending(true);
    try {
      const supabase = createClient();
      if (mode === "login") {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) throw signInError;
        setPassword("");
        router.replace("/app");
        router.refresh();
        return;
      }

      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=/onboarding` },
      });
      if (signUpError) throw signUpError;
      setPassword("");
      setConfirmPassword("");
      if (data.session) {
        router.replace("/onboarding");
        router.refresh();
      } else {
        setMessage("Check your email to confirm your account, then return to sign in.");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Something went wrong. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-9 space-y-5" aria-busy={pending}>
      <div className="space-y-2">
        <label htmlFor="email" className="block text-sm font-medium">Email address</label>
        <Input id="email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@business.com" />
      </div>
      <div className="space-y-2">
        <label htmlFor="password" className="block text-sm font-medium">Password</label>
        <Input id="password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={6} required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 6 characters" />
      </div>
      {mode === "signup" && (
        <div className="space-y-2">
          <label htmlFor="confirm-password" className="block text-sm font-medium">Confirm password</label>
          <Input id="confirm-password" type="password" autoComplete="new-password" minLength={6} required value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Repeat your password" />
        </div>
      )}

      {error && <p role="alert" className="rounded-lg border border-danger/20 bg-danger-soft px-3.5 py-3 text-sm text-danger">{error}</p>}
      {message && <p role="status" className="rounded-lg border border-success/20 bg-success-soft px-3.5 py-3 text-sm text-success">{message}</p>}

      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : null}
        {mode === "login" ? "Sign in" : "Create account"}
        {!pending && <ArrowRight aria-hidden="true" />}
      </Button>

      <p className="text-center text-sm text-muted">
        {mode === "login" ? "New to ClaimBack? " : "Already have an account? "}
        <Link href={mode === "login" ? "/signup" : "/login"} className="font-semibold text-primary underline-offset-4 hover:underline">
          {mode === "login" ? "Create an account" : "Sign in"}
        </Link>
      </p>
    </form>
  );
}
