import Link from "next/link";
import { ArrowRight, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

export function SectionPlaceholder({ title, description, icon: Icon }: { title: string; description: string; icon: LucideIcon }) {
  return (
    <section className="mx-auto max-w-2xl rounded-2xl border border-border bg-surface p-7 shadow-sm sm:p-10">
      <span className="flex size-12 items-center justify-center rounded-xl bg-success-soft text-primary"><Icon className="size-6" aria-hidden="true" /></span>
      <h1 className="mt-6 text-3xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-3 text-base leading-7 text-muted">{description}</p>
      <Button asChild className="mt-7"><Link href="/app">Back to overview <ArrowRight aria-hidden="true" /></Link></Button>
    </section>
  );
}
