import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ClipboardList } from "lucide-react";
import { loadMerchantHistory } from "@/components/dashboard/load-history";
import { formatPaise } from "@/components/dashboard/metrics";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Claims" };

export default async function CasesPage() {
  const { cases, suppliers } = await loadMerchantHistory();
  const supplierNames = new Map(suppliers.map((supplier) => [supplier.id, supplier.name]));
  const ordered = [...cases].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return <div className="space-y-7">
    <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Claims</p><h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Every delivery, followed through.</h1><p className="mt-2 text-sm text-muted">Open a case to review evidence, approve a claim or check recovery.</p></div><Button asChild><Link href="/app/receive">Receive Stock <ArrowRight aria-hidden="true" /></Link></Button></div>
    {ordered.length ? <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">{ordered.map((item) => <li key={item.id}><Link href={`/app/cases/${item.id}`} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 transition-colors hover:bg-surface-soft sm:px-6"><div><p className="text-sm font-semibold">{supplierNames.get(item.supplierId ?? "") ?? item.title ?? "Supplier delivery"}</p><p className="mt-1 text-xs text-muted">{item.status.replaceAll("_", " ").toLowerCase()} · {new Date(item.createdAt).toLocaleDateString("en-IN", { dateStyle: "medium" })}</p></div><div className="flex items-center gap-3"><span className="font-mono text-sm font-semibold">{formatPaise(item.outstandingPaise || item.potentialRecoveryPaise)}</span><ArrowRight className="size-4 text-primary" aria-hidden="true" /></div></Link></li>)}</ul> : <div className="rounded-2xl border border-border bg-surface p-10 text-center"><ClipboardList className="mx-auto size-10 text-primary" aria-hidden="true" /><h2 className="mt-4 text-lg font-semibold">No cases yet</h2><p className="mt-2 text-sm text-muted">Check a delivery to start an evidence-backed case.</p></div>}
  </div>;
}
