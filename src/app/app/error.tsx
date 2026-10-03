"use client";

import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div role="alert" className="mx-auto max-w-xl rounded-2xl border border-danger/20 bg-surface p-8 text-center shadow-sm">
      <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-danger-soft text-danger"><TriangleAlert className="size-6" aria-hidden="true" /></span>
      <h1 className="mt-4 text-xl font-semibold">Your workspace could not load</h1>
      <p className="mt-2 text-sm leading-6 text-muted">Your account is safe. Please try loading this page again.</p>
      <Button onClick={reset} className="mt-6">Try again</Button>
    </div>
  );
}
