import Link from "next/link";
import { ArrowRight, Clock3, PackageSearch, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatPaise, formatRate } from "@/components/dashboard/metrics";
import type { SupplierMetrics } from "@/lib/suppliers/metrics";

function HistoryValue({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <dt className="text-xs font-medium text-muted">{label}</dt>
      <dd className="mt-1 font-mono text-lg font-semibold tabular-nums">{value}</dd>
      {hint && <p className="mt-0.5 text-xs leading-5 text-muted">{hint}</p>}
    </div>
  );
}

export function SuppliersOverview({ suppliers }: { suppliers: SupplierMetrics[] }) {
  const withHistory = suppliers.filter((item) => item.deliveryCount > 0).length;

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Supplier history</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Know who protects your margin.</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted sm:text-base">
            See clean deliveries, discrepancies, claims and recovery from recorded case history.
          </p>
        </div>
        <Button asChild className="shrink-0 self-start"><Link href="/app/receive">Receive Stock <ArrowRight aria-hidden="true" /></Link></Button>
      </div>

      <section aria-label="Supplier coverage" className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm sm:p-6">
          <div className="flex items-center gap-3"><span className="flex size-10 items-center justify-center rounded-xl bg-success-soft text-primary"><Truck className="size-5" aria-hidden="true" /></span><span className="text-sm font-medium text-muted">Suppliers recorded</span></div>
          <p className="mt-4 font-mono text-3xl font-semibold tabular-nums">{suppliers.length.toLocaleString("en-IN")}</p>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm sm:p-6">
          <div className="flex items-center gap-3"><span className="flex size-10 items-center justify-center rounded-xl bg-surface-soft text-primary"><PackageSearch className="size-5" aria-hidden="true" /></span><span className="text-sm font-medium text-muted">With reconciled history</span></div>
          <p className="mt-4 font-mono text-3xl font-semibold tabular-nums">{withHistory.toLocaleString("en-IN")}</p>
        </div>
      </section>

      {suppliers.length ? (
        <section aria-label="Supplier summaries" className="grid gap-5 xl:grid-cols-2">
          {suppliers.map((supplier) => (
            <article key={supplier.id} className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
              <div className="flex items-center justify-between gap-4 border-b border-border p-5 sm:p-6">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-success-soft font-semibold text-primary">{supplier.name.charAt(0).toUpperCase()}</span>
                  <div className="min-w-0">
                    <h2 className="truncate text-lg font-semibold">{supplier.name}</h2>
                    <p className="mt-0.5 text-xs text-muted">{supplier.deliveryCount} reconciled {supplier.deliveryCount === 1 ? "delivery" : "deliveries"}</p>
                  </div>
                </div>
                {supplier.pendingRecoveryPaise > BigInt(0) && <span className="shrink-0 rounded-full bg-warning-soft px-3 py-1.5 text-xs font-semibold text-warning">Recovery pending</span>}
              </div>

              {supplier.deliveryCount ? (
                <>
                  <dl className="grid grid-cols-2 gap-x-5 gap-y-6 p-5 sm:grid-cols-3 sm:p-6">
                    <HistoryValue label="Delivery accuracy" value={formatRate(supplier.cleanDeliveryRate)} hint="No discrepancy found" />
                    <HistoryValue label="Discrepancy rate" value={formatRate(supplier.discrepancyRate)} hint={`${supplier.discrepancyCount} flagged`} />
                    <HistoryValue label="Total claimed" value={formatPaise(supplier.claimedPaise)} />
                    <HistoryValue label="Recovered" value={formatPaise(supplier.recoveredPaise)} />
                    <HistoryValue label="Still recoverable" value={formatPaise(supplier.pendingRecoveryPaise)} />
                    <HistoryValue label="Avg. resolution" value={supplier.averageResolutionDays === null ? "—" : `${Math.round(supplier.averageResolutionDays * 10) / 10}d`} hint="Resolved cases only" />
                  </dl>
                  <div className="border-t border-border bg-surface-soft px-5 py-3 text-xs leading-5 text-muted sm:px-6">
                    Delivery accuracy uses reconciled deliveries with no discrepancy. Recovery counts verified amounts only.
                  </div>
                </>
              ) : (
                <div className="flex items-start gap-3 p-5 text-sm leading-6 text-muted sm:p-6">
                  <Clock3 className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
                  <p>No reconciled deliveries yet. History metrics will appear after a case is checked.</p>
                </div>
              )}
            </article>
          ))}
        </section>
      ) : (
        <section className="rounded-2xl border border-dashed border-border bg-surface px-6 py-14 text-center">
          <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-success-soft text-primary"><Truck className="size-7" aria-hidden="true" /></span>
          <h2 className="mt-5 text-lg font-semibold">No suppliers recorded yet.</h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted">Receive your first delivery to start building a supplier history grounded in actual cases.</p>
          <Button asChild className="mt-6"><Link href="/app/receive">Receive Stock <ArrowRight aria-hidden="true" /></Link></Button>
        </section>
      )}
    </div>
  );
}
