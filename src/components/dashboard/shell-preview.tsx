import Link from "next/link";
import { ArrowRight, Box, FileText, MessageSquareText } from "lucide-react";
import { Button } from "@/components/ui/button";

const receivingSteps = [
  { title: "Supplier promise", detail: "The rate, quantity or scheme agreed", icon: MessageSquareText },
  { title: "Invoice", detail: "The amount and units billed", icon: FileText },
  { title: "Stock received", detail: "The units and condition at delivery", icon: Box },
] as const;

export function ShellPreview() {
  return (
    <div className="space-y-8">
      <section className="flex flex-col gap-5 rounded-2xl border border-border bg-surface p-6 shadow-sm sm:p-8 xl:flex-row xl:items-center xl:justify-between">
        <div className="max-w-2xl">
          <span className="inline-flex rounded-full bg-success-soft px-3 py-1.5 text-xs font-semibold text-primary">Your workspace is ready</span>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">Protect margin at the receiving desk.</h1>
          <p className="mt-3 text-sm leading-6 text-muted sm:text-base">Capture a supplier promise, invoice and what arrived. ClaimBack helps you spot differences and keeps approved claims open until recovery is verified.</p>
        </div>
        <Button asChild size="lg" className="shrink-0"><Link href="/app/receive">Receive Stock <ArrowRight aria-hidden="true" /></Link></Button>
      </section>

      <section aria-labelledby="how-it-works-heading">
        <div className="flex items-end justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Getting started</p><h2 id="how-it-works-heading" className="mt-1 text-xl font-semibold">Three inputs. One clear picture.</h2></div></div>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          {receivingSteps.map(({ title, detail, icon: Icon }, index) => (
            <div key={title} className="rounded-2xl border border-border bg-surface p-5">
              <div className="flex items-center justify-between"><span className="flex size-10 items-center justify-center rounded-xl bg-surface-soft text-primary"><Icon className="size-5" aria-hidden="true" /></span><span className="font-mono text-xs text-muted">0{index + 1}</span></div>
              <h3 className="mt-5 text-base font-semibold">{title}</h3><p className="mt-1 text-sm leading-6 text-muted">{detail}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-dashed border-border bg-surface-soft px-6 py-8 text-center">
        <p className="text-sm font-semibold">Your case overview will appear here.</p>
        <p className="mt-1 text-sm text-muted">Start with a delivery to see source-linked discrepancies and recovery progress.</p>
      </section>
    </div>
  );
}
