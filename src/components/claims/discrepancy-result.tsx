"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, ExternalLink, FileSearch, ShieldCheck } from "lucide-react";
import type { Discrepancy, SourceEvidence } from "@/types/domain";
import { formatPaise } from "@/components/dashboard/metrics";
import { evidenceHref, presentDiscrepancy } from "./presentation";
import { loadVisibleEvents, type VisibleEvent } from "./events";

type Result =
  | { outcome: "clean"; message: string; discrepancies: [] }
  | { outcome: "discrepancy"; message: string; discrepancies: Discrepancy[]; totalPotentialRecoveryPaise: number }
  | { outcome: "needs_confirmation"; message: string; confirmations: { reason: string }[] };

function Evidence({ caseId, source, label, value }: { caseId: string; source: SourceEvidence; label: string; value: string }) {
  const href = evidenceHref(caseId, source);
  return (
    <div className="min-w-0 rounded-lg border border-border bg-surface p-3">
      <p className="text-[11px] font-bold uppercase tracking-wider text-muted">{label}</p>
      <p className="mt-1 text-sm font-semibold">{value}</p>
      <p className="mt-2 break-words text-xs text-muted">{source.sourceLabel}</p>
      {(source.excerpt || source.locator) && <p className="mt-1 line-clamp-2 break-words text-xs text-muted">{source.excerpt || source.locator}</p>}
      {href ? <a href={href} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-primary underline-offset-2 hover:underline">View Evidence <ExternalLink className="size-3" aria-hidden="true" /></a> : <a href="#receiving-heading" className="mt-2 inline-block text-xs font-semibold text-primary underline-offset-2 hover:underline">Review confirmed counts</a>}
    </div>
  );
}

function DiscrepancyCard({ caseId, item }: { caseId: string; item: Discrepancy }) {
  const display = presentDiscrepancy(item);
  return (
    <article className="rounded-2xl border border-border bg-surface p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><p className="text-xs font-bold uppercase tracking-[0.13em] text-warning">Supported difference</p><h3 className="mt-1 text-lg font-semibold">{display.title}</h3><p className="mt-1 text-sm text-muted">{item.skuRef} · {item.description}</p></div>
        <p className="font-mono text-xl font-semibold tabular-nums">{formatPaise(BigInt(item.amountPaise))}</p>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <Evidence caseId={caseId} source={item.promisedEvidence} label="Promised" value={display.promised} />
        <Evidence caseId={caseId} source={item.billedEvidence} label="Billed" value={display.billed} />
        <Evidence caseId={caseId} source={item.receivedEvidence} label="Received" value={display.received} />
      </div>
      <p className="mt-4 rounded-lg bg-surface-soft p-3 font-mono text-xs leading-5 text-foreground">{display.formula}</p>
    </article>
  );
}

function ActionTimeline({ caseId, outcome }: { caseId: string; outcome: Result["outcome"] }) {
  const [events, setEvents] = useState<VisibleEvent[] | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    loadVisibleEvents(caseId).then((items) => { if (active) setEvents(items); }).catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [caseId]);

  return (
    <section aria-labelledby="action-timeline-heading" className="rounded-2xl border border-border bg-surface p-5 shadow-sm sm:p-6">
      <h3 id="action-timeline-heading" className="text-lg font-semibold">Action timeline</h3>
      <p className="mt-1 text-sm text-muted">Recorded operational steps for this delivery.</p>
      {events === null && !error && <p role="status" className="mt-4 text-sm text-muted">Loading recorded actions…</p>}
      {error && <p role="alert" className="mt-4 text-sm text-warning">Recorded actions are temporarily unavailable. Your saved result remains visible.</p>}
      {events && <ol className="mt-5 space-y-4">{events.map((event) => <li key={event.id} className="flex items-start gap-3 text-sm"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" /><div><p className="font-medium">{event.label}</p><time dateTime={event.createdAt} className="text-xs text-muted">{new Date(event.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</time></div></li>)}{outcome === "discrepancy" && !events.some((event) => event.label === "Waiting for merchant approval") && <li className="flex items-center gap-3 text-sm text-muted"><span className="ml-1 size-2 rounded-full border border-warning" />Next: merchant approval before any supplier message</li>}</ol>}
      {events?.length === 0 && <p className="mt-4 text-sm text-muted">No recorded actions yet.</p>}
    </section>
  );
}

export function DiscrepancyResult({ caseId, result }: { caseId: string; result: Result }) {
  if (result.outcome === "needs_confirmation") return <section role="status" className="rounded-2xl border border-warning/20 bg-warning-soft p-5"><h2 className="font-semibold">More confirmation needed</h2><p className="mt-2 text-sm">{result.message}</p><ul className="mt-3 list-disc space-y-1 pl-5 text-sm">{result.confirmations.map((item, index) => <li key={index}>{item.reason}</li>)}</ul></section>;
  if (result.outcome === "clean") return <div className="space-y-5"><section role="status" className="rounded-2xl border border-primary/20 bg-success-soft p-6"><ShieldCheck className="size-8 text-primary" aria-hidden="true" /><h2 className="mt-3 text-xl font-semibold">Delivery looks correct. No claim required.</h2><p className="mt-2 text-sm text-muted">The confirmed promise, invoice and receiving counts agree.</p></section><ActionTimeline caseId={caseId} outcome="clean" /></div>;
  return (
    <div className="space-y-5">
      <section role="status" className="rounded-2xl border border-warning/20 bg-warning-soft p-6"><div className="flex items-start gap-3"><FileSearch className="mt-0.5 size-6 shrink-0 text-warning" aria-hidden="true" /><div><h2 className="text-xl font-semibold">{result.discrepancies.length} source-grounded {result.discrepancies.length === 1 ? "difference" : "differences"} found</h2><p className="mt-1 text-sm text-muted">Potential recovery: <strong className="font-mono text-foreground">{formatPaise(BigInt(result.totalPotentialRecoveryPaise))}</strong>. Check the evidence below before approving any claim.</p></div></div></section>
      <section aria-label="Discrepancies" className="space-y-4">{result.discrepancies.map((item) => <DiscrepancyCard key={item.id} caseId={caseId} item={item} />)}</section>
      <ActionTimeline caseId={caseId} outcome="discrepancy" />
    </div>
  );
}
