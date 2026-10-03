import Link from "next/link";
import {
  ArrowRight,
  Bot,
  CircleCheck,
  Clock3,
  FileSearch,
  IndianRupee,
  Mic,
  PackageCheck,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { DashboardSummary, SupplierHistory, CaseStatus } from "./metrics";
import { formatPaise } from "./metrics";

const statusLabels: Record<CaseStatus, string> = {
  DRAFT: "Draft",
  EVIDENCE_CAPTURED: "Evidence captured",
  RECONCILED: "Reconciled",
  NO_DISCREPANCY: "No discrepancy",
  DISCREPANCY_FOUND: "Discrepancy found",
  AWAITING_MERCHANT_APPROVAL: "Needs your approval",
  CLAIM_SENT: "Claim sent",
  AWAITING_SUPPLIER: "Awaiting supplier",
  SUPPLIER_RESPONDED: "Supplier responded",
  AWAITING_RECOVERY: "Awaiting recovery",
  RECOVERY_VERIFICATION: "Checking recovery",
  RESOLVED: "Resolved",
  ESCALATED: "Escalated",
};

type Metric = {
  label: string;
  value: string;
  detail: string;
  icon: typeof Clock3;
  iconClassName: string;
  iconBackground: string;
};

function MetricCard({ label, value, detail, icon: Icon, iconClassName, iconBackground }: Metric) {
  return (
    <article className="rounded-2xl border border-border bg-surface p-5 shadow-sm sm:p-6">
      <div className={`flex size-11 items-center justify-center rounded-xl ${iconBackground}`}>
        <Icon className={`size-5 ${iconClassName}`} aria-hidden="true" />
      </div>
      <p className="mt-5 text-[11px] font-bold uppercase tracking-[0.14em] text-muted">{label}</p>
      <p className="mt-2 font-mono text-[clamp(1.5rem,2.3vw,2rem)] font-semibold tabular-nums tracking-tight">{value}</p>
      <p className="mt-2 text-sm leading-5 text-muted">{detail}</p>
    </article>
  );
}

export function DashboardOverview({
  summary,
  suppliers,
}: {
  summary: DashboardSummary;
  suppliers: SupplierHistory[];
}) {
  const supplierNames = new Map(suppliers.map((item) => [item.id, item.name]));
  const metrics: Metric[] = [
    {
      label: "Pending recovery",
      value: formatPaise(summary.pendingRecoveryPaise),
      detail: "Claimed balance still awaiting verified credit or stock.",
      icon: Clock3,
      iconClassName: "text-warning",
      iconBackground: "bg-warning-soft",
    },
    {
      label: "Leakage detected",
      value: formatPaise(summary.leakageDetectedPaise),
      detail: "Potential loss identified across your cases.",
      icon: FileSearch,
      iconClassName: "text-danger",
      iconBackground: "bg-danger-soft",
    },
    {
      label: "Recovered",
      value: formatPaise(summary.recoveredPaise),
      detail: "Amount recorded as recovered after verification.",
      icon: IndianRupee,
      iconClassName: "text-primary",
      iconBackground: "bg-success-soft",
    },
    {
      label: "Open claims",
      value: summary.openClaims.toLocaleString("en-IN"),
      detail: "Claims sent or waiting for your approval.",
      icon: PackageCheck,
      iconClassName: "text-primary",
      iconBackground: "bg-surface-soft",
    },
  ];

  return (
    <div className="space-y-8">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Your delivery desk</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">What arrived today?</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted sm:text-base">
          Talk it through with ClaimBack, then check the invoice, supplier promise and actual stock together.
        </p>
      </div>

      <section aria-label="Start a delivery conversation" className="rounded-[1.5rem] border border-primary/20 bg-surface p-5 shadow-sm sm:p-7">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-start gap-4"><span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-success-soft text-primary"><Bot className="size-6" aria-hidden="true" /></span><div><p className="text-xs font-bold uppercase tracking-[0.15em] text-primary">ClaimBack assistant</p><h2 className="mt-1 text-xl font-semibold tracking-tight sm:text-2xl">“Tell me what arrived.”</h2><p className="mt-2 max-w-xl text-sm leading-6 text-muted">Speak or type first. Add your invoice and supplier message as we go. ClaimBack suggests counts and explains every difference before you approve a claim.</p></div></div>
          <Link href="/app/receive" className="inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-lg bg-primary px-5 text-sm font-semibold text-white transition-colors hover:bg-primary/90"><Mic className="size-4" aria-hidden="true" />Talk to ClaimBack <ArrowRight className="size-4" aria-hidden="true" /></Link>
        </div>
      </section>

      <section aria-labelledby="margin-protected-heading" className="relative overflow-hidden rounded-[1.5rem] bg-[#123f2d] p-6 text-white shadow-sm sm:p-8 lg:p-10">
        <div aria-hidden="true" className="pointer-events-none absolute -right-28 -top-40 size-[28rem] rounded-full border border-white/10" />
        <div aria-hidden="true" className="pointer-events-none absolute -right-10 -top-24 size-[20rem] rounded-full border border-white/10" />
        <div className="relative">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold text-[#d6f4df]">
              <ShieldCheck className="size-4" aria-hidden="true" /> Verified recovery
            </span>
            <h2 id="margin-protected-heading" className="mt-6 text-xs font-bold uppercase tracking-[0.2em] text-[#c7e7d1]">Margin protected</h2>
            <p className="mt-2 font-mono text-[clamp(2.6rem,6vw,4.7rem)] font-semibold leading-none tabular-nums tracking-tight">
              {formatPaise(summary.marginProtectedPaise)}
            </p>
            <p className="mt-4 max-w-xl text-sm leading-6 text-[#d6e8db]">
              Counted only when recovery is recorded as verified. A supplier promise stays in pending recovery.
            </p>
          </div>
        </div>
      </section>

      <section aria-label="Business metrics" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => <MetricCard key={metric.label} {...metric} />)}
      </section>

      <section aria-labelledby="attention-heading" className="rounded-2xl border border-border bg-surface shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-5 sm:px-6">
          <div>
            <h2 id="attention-heading" className="text-xl font-semibold">Cases to follow</h2>
            <p className="mt-1 text-sm text-muted">Differences that still need a decision or verified recovery.</p>
          </div>
          <Button asChild variant="outline" size="sm"><Link href="/app/cases">View claims <ArrowRight aria-hidden="true" /></Link></Button>
        </div>
        {summary.attentionCases.length ? (
          <ul className="divide-y divide-border">
            {summary.attentionCases.map((item) => (
              <li key={item.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{item.title || supplierNames.get(item.supplierId ?? "") || "Supplier delivery"}</p>
                  <p className="mt-1 text-xs text-muted">{supplierNames.get(item.supplierId ?? "") ?? "Supplier not assigned"} · {statusLabels[item.status]}</p>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <span className="font-mono font-semibold tabular-nums">{formatPaise(item.outstandingPaise || item.potentialRecoveryPaise)}</span>
                  <span className="rounded-full bg-warning-soft px-2.5 py-1 text-xs font-semibold text-warning">Open</span>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="flex flex-col items-center px-6 py-12 text-center">
            <span className="flex size-12 items-center justify-center rounded-2xl bg-success-soft text-primary"><CircleCheck className="size-6" aria-hidden="true" /></span>
            <p className="mt-4 text-sm font-semibold">No cases need attention right now.</p>
            <p className="mt-1 max-w-md text-sm leading-6 text-muted">
              {summary.caseCount === 0
                ? "Record your first delivery to see leakage and recovery progress here."
                : "When a delivery needs a claim or recovery check, it will appear here."}
            </p>
            {summary.caseCount === 0 && <Button asChild size="sm" className="mt-5"><Link href="/app/receive">Receive Stock <ArrowRight aria-hidden="true" /></Link></Button>}
          </div>
        )}
      </section>
    </div>
  );
}
