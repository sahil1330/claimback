"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Clock3, FileCheck2, LoaderCircle, MessageSquareText, ShieldCheck } from "lucide-react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { formatPaise } from "@/components/dashboard/metrics";

const scenariosSchema = z.object({ scenarios: z.array(z.object({ id: z.string().min(1), name: z.string().min(1) })) });
const decisionSchema = z.object({
  discrepancyId: z.string(), outcome: z.string(), sourceExcerpt: z.string().nullable(),
  supplierAcknowledgedPaise: z.number().int().safe().nullable(),
  promisedForText: z.string().nullable(), uncertainty: z.string().nullable(),
});
const responseSchema = z.object({
  caseState: z.string(), acknowledgedPaise: z.number().int().safe(),
  response: z.object({ rawBody: z.string(), decisions: z.array(decisionSchema), needsConfirmation: z.boolean() }).nullable(),
});
const errorSchema = z.object({ error: z.string() });
type DemoResponse = z.infer<typeof responseSchema>;

export function SupplierSimulator({ caseId, supplierName, canTrigger }: { caseId: string; supplierName: string; canTrigger: boolean }) {
  const [scenarios, setScenarios] = useState<z.infer<typeof scenariosSchema>["scenarios"]>([]);
  const [scenarioId, setScenarioId] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DemoResponse | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/demo/supplier-response")
      .then(async (response) => {
        const body: unknown = await response.json();
        if (!response.ok) {
          const parsed = errorSchema.safeParse(body);
          throw new Error(parsed.success ? parsed.data.error : "Demo scenarios are unavailable.");
        }
        return scenariosSchema.parse(body).scenarios;
      })
      .then((items) => { if (active) { setScenarios(items); setScenarioId(items[0]?.id ?? ""); } })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Demo scenarios are unavailable."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function trigger() {
    if (busy || !canTrigger || !scenarioId) return;
    setBusy(true); setError(null); setResult(null);
    try {
      const response = await fetch("/api/demo/supplier-response", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caseId, scenarioId }),
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const parsed = errorSchema.safeParse(body);
        throw new Error(parsed.success ? parsed.data.error : "Supplier scenario could not run. Retry this step.");
      }
      setResult(responseSchema.parse(body));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Supplier scenario could not run. Retry this step.");
    } finally { setBusy(false); }
  }

  return (
    <main className="min-h-screen bg-[#f7f8f4] px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto max-w-6xl">
        <Link href={`/app/cases/${caseId}`} className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline"><ArrowLeft className="size-4" aria-hidden="true" />Back to case</Link>
        <header className="mt-6 rounded-[1.5rem] bg-[#163e2d] px-5 py-7 text-white sm:px-8 sm:py-9">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.15em] text-[#c9e98d]"><ShieldCheck className="size-4" aria-hidden="true" />ClaimBack demo / Supplier response</p>
          <div className="mt-5 flex flex-col justify-between gap-5 md:flex-row md:items-end">
            <div><h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">See what the supplier says.</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-[#d2e1d5]">Choose a simulated reply from {supplierName}, then return to the case to review the commitment and what remains open.</p></div>
            <span className="w-fit rounded-full border border-white/25 bg-white/10 px-3 py-1.5 text-xs font-semibold">Simulated transport · no real supplier contacted</span>
          </div>
        </header>
        <div className="mt-6 grid items-start gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <section aria-labelledby="scenario-heading" className="rounded-2xl border border-border bg-surface p-5 shadow-sm sm:p-6">
            <span className="flex size-11 items-center justify-center rounded-xl bg-success-soft text-primary"><MessageSquareText className="size-6" aria-hidden="true" /></span>
            <h2 id="scenario-heading" className="mt-5 text-xl font-semibold">Choose a response scenario</h2>
            <p className="mt-2 text-sm leading-6 text-muted">Supplier replies are stateful. Some scenarios take multiple steps; trigger the same scenario again to receive the next reply.</p>
            {loading ? <p role="status" className="mt-6 flex items-center gap-2 text-sm text-muted"><LoaderCircle className="size-4 animate-spin" aria-hidden="true" />Loading demo scenarios…</p> : <>
              <label htmlFor="supplier-scenario" className="mt-6 block text-xs font-semibold uppercase tracking-wide text-muted">Supplier scenario</label>
              <select id="supplier-scenario" className="mt-2 min-h-12 w-full rounded-lg border border-border bg-surface px-3 text-sm font-medium" value={scenarioId} onChange={(event) => { setScenarioId(event.target.value); setResult(null); setError(null); }} disabled={busy || !canTrigger}><option value="">Choose a scenario</option>{scenarios.map((scenario) => <option key={scenario.id} value={scenario.id}>{scenario.name}</option>)}</select>
              <Button type="button" className="mt-4 w-full sm:w-auto" disabled={!canTrigger || !scenarioId || busy} onClick={trigger}>{busy ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <ArrowRight className="size-4" aria-hidden="true" />}{busy ? "Interpreting reply…" : "Trigger simulated response"}</Button>
            </>}
            {!canTrigger && <p className="mt-4 rounded-lg bg-warning-soft p-3 text-sm text-warning">This case is not awaiting a supplier response. Review its current state on the case page.</p>}
            {error && <p role="alert" className="mt-4 rounded-lg bg-danger-soft p-3 text-sm text-danger">{error}</p>}
            <div className="mt-6 border-t border-border pt-5"><p className="text-xs font-semibold uppercase tracking-wide text-muted">What happens next</p><ol className="mt-3 space-y-3 text-sm text-muted"><li className="flex gap-3"><span className="font-mono text-primary">01</span>Supplier reply is saved to the case.</li><li className="flex gap-3"><span className="font-mono text-primary">02</span>Accepted, disputed and uncertain items stay visible.</li><li className="flex gap-3"><span className="font-mono text-primary">03</span>Promised credit waits for later proof.</li></ol></div>
          </section>
          <section aria-labelledby="reply-heading" className="rounded-2xl border border-border bg-surface p-5 shadow-sm sm:p-6">
            <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Latest simulated result</p><h2 id="reply-heading" className="mt-2 text-xl font-semibold">{result?.response ? "Supplier reply received" : result ? "No reply yet" : "Waiting for a scenario"}</h2></div><span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#f4f0e3] text-[#896a24]">{result ? <FileCheck2 className="size-5" aria-hidden="true" /> : <Clock3 className="size-5" aria-hidden="true" />}</span></div>
            {!result ? <div className="mt-5 rounded-xl border border-dashed border-border bg-surface-soft px-5 py-8 text-sm leading-6 text-muted">Select a scenario and trigger a reply. The supplier&apos;s wording and ClaimBack&apos;s interpretation will appear here.</div> : <div role="status" className="mt-5 space-y-5">
              <div className="rounded-xl bg-warning-soft p-4"><p className="text-xs font-semibold uppercase tracking-wide text-warning">Commitment, not recovered money</p><p className="mt-2 text-2xl font-semibold tabular-nums">{formatPaise(BigInt(result.acknowledgedPaise))}</p><p className="mt-1 text-sm leading-6 text-warning">Case state: {result.caseState.replaceAll("_", " ").toLowerCase()}. Recovery requires later invoice, credit note or replacement evidence.</p></div>
              {result.response ? <><div><h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Supplier wording</h3><blockquote className="mt-2 whitespace-pre-wrap rounded-xl border border-border bg-surface-soft p-4 text-sm leading-6">{result.response.rawBody}</blockquote></div><div><h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Interpreted claim items</h3>{result.response.decisions.length === 0 ? <p className="mt-2 text-sm text-muted">No item-level decision was found in this reply.</p> : <ul className="mt-2 space-y-2">{result.response.decisions.map((decision) => <li key={decision.discrepancyId} className="rounded-xl border border-border p-4 text-sm"><p className="font-semibold capitalize">{decision.outcome.replaceAll("_", " ")}</p>{decision.supplierAcknowledgedPaise !== null && <p className="mt-1">{formatPaise(BigInt(decision.supplierAcknowledgedPaise))} acknowledged</p>}{decision.promisedForText && <p className="mt-1 text-warning">Promised for: {decision.promisedForText}</p>}{decision.sourceExcerpt && <p className="mt-2 text-xs leading-5 text-muted">Source: “{decision.sourceExcerpt}”</p>}{decision.uncertainty && <p className="mt-2 text-xs leading-5 text-warning">Uncertain: {decision.uncertainty}</p>}</li>)}</ul>}{result.response.needsConfirmation && <p className="mt-3 rounded-lg bg-warning-soft p-3 text-sm text-warning">Some wording needs merchant review.</p>}</div></> : <p className="text-sm leading-6 text-muted">The supplier has not responded to this step. The case remains open.</p>}
            </div>}
            <Button asChild variant="outline" className="mt-6 w-full sm:w-auto"><Link href={`/app/cases/${caseId}`}>Review updated case <ArrowRight className="size-4" aria-hidden="true" /></Link></Button>
          </section>
        </div>
      </div>
    </main>
  );
}
