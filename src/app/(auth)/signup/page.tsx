import type { Metadata } from "next";
import { AuthFrame } from "@/components/auth/auth-frame";
import { AuthForm } from "@/components/auth/auth-form";

export const metadata: Metadata = { title: "Create account" };

export default function SignupPage() {
  return (
    <AuthFrame eyebrow="Get started" title="Protect the margin you earn." description="Create your account, add your business, and start checking stock against supplier promises.">
      <AuthForm mode="signup" />
    </AuthFrame>
  );
}
