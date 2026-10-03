import type { Metadata } from "next";
import { AuthFrame } from "@/components/auth/auth-frame";
import { AuthForm } from "@/components/auth/auth-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams;
  return (
    <AuthFrame eyebrow="Welcome back" title="Keep every recovery moving." description="Sign in to review deliveries, claims and supplier credits in one place.">
      <AuthForm mode="login" callbackError={params.error === "auth_callback"} />
    </AuthFrame>
  );
}
