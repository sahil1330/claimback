"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, LoaderCircle, MessageSquareText } from "lucide-react";
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

  return <main className="mx-auto max-w-3xl space-y-6 px-4 py-10 sm:px-6">
    <Link href={`/app/cases/${caseId}`} className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline"><ArrowLeft className="size-4" aria-hidden="true" />Back to case</Link>
    <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">ClaimBack demo</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">Supplier response simulator</h1><p className="mt-2 text-sm leading-6 text-muted">This is a simulated supplier transport for {supplierName}. It is not WhatsApp and sends no real supplier message.</p></div>
    <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm sm:p-6"><MessageSquareText className="size-7 text-primary" aria-hidden="true" /><h2 className="mt-3 text-lg font-semibold">Choose a response scenario</h2>{loading ? <p role="status" className="mt-3 text-sm text-muted">Loading demo scenarios…</p> : <><label className="mt-4 block text-xs font-semibold">Scenario<select className="mt-2 min-h-11 w-full rounded-lg border border-border bg-surface px-3 text-sm" value={scenarioId} onChange={(event) => setScenarioId(event.target.value)} disabled={busy || !canTrigger}><option value="">Choose a scenario</option>{scenarios.map((scenario) => <option key={scenario.id} value={scenario.id}>{scenario.name}</option>)}</select></label><p className="mt-3 text-xs text-muted">A scenario may take multiple steps. Run it again to receive the next simulated reply.</p><Button type="button" className="mt-4" disabled={!canTrigger || !scenarioId || busy} onClick={trigger}>{busy && <LoaderCircle className="animate-spin" aria-hidden="true" />}{busy ? "Interpreting reply…" : "Trigger simulated response"}</Button></>}{!canTrigger && <p className="mt-3 text-sm text-warning">This case is not awaiting a supplier response. Review its current state in the case page.</p>}</section>
    {error && <p role="alert" className="rounded-xl bg-danger-soft p-4 text-sm text-danger">{error}</p>}
    {result && <section role="status" className="rounded-2xl border border-border bg-surface p-5 sm:p-6"><h2 className="text-lg font-semibold">{result.response ? "Supplier reply received" : "No reply yet"}</h2><p className="mt-2 text-sm text-muted">Case state: {result.caseState.replaceAll("_", " ").toLowerCase()}. Acknowledged commitment: {formatPaise(BigInt(result.acknowledgedPaise))}. This is not verified recovery.</p>{result.response && <><blockquote className="mt-4 whitespace-pre-wrap rounded-lg bg-surface-soft p-4 text-sm">{result.response.rawBody}</blockquote><ul className="mt-4 space-y-2">{result.response.decisions.map((decision) => <li key={decision.discrepancyId} className="rounded-lg border border-border p-3 text-sm"><strong className="capitalize">{decision.outcome.replaceAll("_", " ")}</strong>{decision.supplierAcknowledgedPaise !== null && <span> · {formatPaise(BigInt(decision.supplierAcknowledgedPaise))} acknowledged</span>}{decision.promisedForText && <p className="mt-1 text-xs text-warning">Promised for: {decision.promisedForText}</p>}{decision.sourceExcerpt && <p className="mt-1 text-xs text-muted">Source: “{decision.sourceExcerpt}”</p>}{decision.uncertainty && <p className="mt-1 text-xs text-warning">Uncertain: {decision.uncertainty}</p>}</li>)}</ul>{result.response.needsConfirmation && <p className="mt-3 text-sm text-warning">Some wording needs merchant review.</p>}</>}<Button asChild variant="outline" className="mt-5"><Link href={`/app/cases/${caseId}`}>Review updated case</Link></Button></section>}
  </main>;
}
