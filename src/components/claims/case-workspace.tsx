"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, CheckCircle2, LoaderCircle, Send } from "lucide-react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { formatPaise } from "@/components/dashboard/metrics";
import { DiscrepancyResult } from "./discrepancy-result";
import type { CaseView } from "./load-case";

const responseErrorSchema = z.object({ error: z.string() });
const approvalResponseSchema = z.object({
  approval: z.object({ merchantApprovedAt: z.string() }),
  sent: z.object({ status: z.enum(["sent", "already_sent"]), caseState: z.string() }),
});

const stateLabels: Record<CaseView["status"], string> = {
  DRAFT: "Draft", EVIDENCE_CAPTURED: "Evidence captured", RECONCILED: "Reconciled",
  NO_DISCREPANCY: "No discrepancy", DISCREPANCY_FOUND: "Discrepancy found",
  AWAITING_MERCHANT_APPROVAL: "Waiting for your approval", CLAIM_SENT: "Claim sent",
  AWAITING_SUPPLIER: "Awaiting supplier", SUPPLIER_RESPONDED: "Supplier responded",
  AWAITING_RECOVERY: "Awaiting recovery", RECOVERY_VERIFICATION: "Checking recovery",
  RESOLVED: "Resolved", ESCALATED: "Needs follow-up",
};

const decisionLabels = {
  accepted: "Accepted",
  rejected: "Rejected",
  promise_credit: "Credit promised for later",
  replacement: "Replacement promised",
  unresolved: "Unresolved",
} as const;

function amount(value: string | number): string {
  return formatPaise(BigInt(value));
}

function SupplierReplies({ caseView }: { caseView: CaseView }) {
  if (caseView.messages.length === 0) return null;
  const titles = new Map(caseView.discrepancies.map((item) => [item.id, item.type.replaceAll("_", " ").toLowerCase()]));
  return (
    <section aria-labelledby="supplier-replies-heading" className="space-y-4">
      <div><h2 id="supplier-replies-heading" className="text-xl font-semibold">Supplier replies</h2><p className="mt-1 text-sm text-muted">A response is evidence of a commitment. Recovery stays open until checked against a later credit or delivery.</p></div>
      {caseView.messages.map((message) => <article key={message.id} className="rounded-2xl border border-border bg-surface p-5 shadow-sm sm:p-6">
        <p className="text-xs font-bold uppercase tracking-wider text-muted">Simulated supplier response · {new Date(message.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</p>
        <blockquote className="mt-3 whitespace-pre-wrap rounded-lg bg-surface-soft p-4 text-sm leading-6">{message.body}</blockquote>
        {message.analysis ? <><div className="mt-4 space-y-3">{message.analysis.decisions.map((decision) => <div key={decision.discrepancyId} className="rounded-lg border border-border p-3 text-sm"><div className="flex flex-wrap justify-between gap-2"><strong className="capitalize">{titles.get(decision.discrepancyId) ?? "Claim item"}</strong><span className="font-semibold">{decisionLabels[decision.outcome]}</span></div>{decision.supplierAcknowledgedPaise !== null && <p className="mt-1">Acknowledged: {amount(decision.supplierAcknowledgedPaise)} · {decision.coverage} coverage</p>}{decision.promisedForText && <p className="mt-1 text-warning">Timing: {decision.promisedForText}</p>}{decision.sourceExcerpt && <p className="mt-2 text-xs text-muted">Source: “{decision.sourceExcerpt}”</p>}{decision.uncertainty && <p className="mt-2 text-xs text-warning">Needs review: {decision.uncertainty}</p>}</div>)}</div>{message.analysis.needsConfirmation && <p className="mt-4 rounded-lg bg-warning-soft p-3 text-sm text-warning">Some response details remain uncertain. Check the supplier wording before relying on them.</p>}</> : <p className="mt-4 text-sm text-warning">This reply is saved; its interpretation is not yet available.</p>}
      </article>)}
    </section>
  );
}

export function CaseWorkspace({ caseView }: { caseView: CaseView }) {
  const router = useRouter();
  const [reviewed, setReviewed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const approvalAvailable = ["DISCREPANCY_FOUND", "AWAITING_MERCHANT_APPROVAL"].includes(caseView.status) &&
    caseView.discrepancies.length > 0 && !caseView.claimSentAt;
  const hasClaim = caseView.discrepancies.length > 0;
  const needsApproval = !caseView.merchantApprovedAt;

  async function approveAndSend() {
    if (!approvalAvailable || (needsApproval && !reviewed) || busy) return;
    setBusy(true); setError(null); setSuccess(null);
    try {
      const response = await fetch(`/api/cases/${caseView.id}/approve`, { method: "POST" });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const parsedError = responseErrorSchema.safeParse(body);
        throw new Error(parsedError.success ? parsedError.data.error : "Claim approval failed. Retry from this case.");
      }
      const result = approvalResponseSchema.parse(body);
      setSuccess(result.sent.status === "already_sent" ? "This approved claim was already sent. No duplicate message was created." : "Approval recorded and claim sent through the demo transport.");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not approve and send the claim. Retry safely.");
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-7">
      <Link href="/app/cases" className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline"><ArrowLeft className="size-4" aria-hidden="true" />All cases</Link>
      <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Case details</p><h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">{caseView.supplierName ?? caseView.title ?? "Supplier delivery"}</h1><p className="mt-2 text-sm text-muted">{caseView.title && caseView.supplierName ? `${caseView.title} · ` : ""}Case {caseView.id.slice(0, 8)}</p></div><span className="rounded-full bg-success-soft px-3 py-1.5 text-xs font-semibold text-primary">{stateLabels[caseView.status]}</span></div>
      <section aria-label="Case amounts" className="grid gap-3 sm:grid-cols-3">{[
        ["Potential recovery", caseView.potentialRecoveryPaise],
        ["Verified recovered", caseView.recoveredPaise],
        ["Outstanding", caseView.outstandingPaise],
      ].map(([label, value]) => <div key={label} className="rounded-2xl border border-border bg-surface p-5"><p className="text-xs font-bold uppercase tracking-wider text-muted">{label}</p><p className="mt-2 font-mono text-2xl font-semibold tabular-nums">{amount(value)}</p></div>)}</section>
      {error && <p role="alert" className="rounded-xl bg-danger-soft p-4 text-sm text-danger">{error}</p>}
      {success && <p role="status" className="rounded-xl bg-success-soft p-4 text-sm text-primary">{success}</p>}
      {approvalAvailable && <section aria-labelledby="claim-approval-heading" className="rounded-2xl border border-primary/20 bg-success-soft p-5 sm:p-6"><h2 id="claim-approval-heading" className="text-lg font-semibold">Review and approve the claim</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-muted">The draft uses only the sourced differences shown below. Your approval is required before a supplier-facing message is sent through the demo transport.</p>{needsApproval && <label className="mt-4 flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1 accent-primary" checked={reviewed} onChange={(event) => setReviewed(event.target.checked)} />I reviewed the discrepancy amounts and linked evidence.</label>}<Button type="button" className="mt-4" disabled={busy || (needsApproval && !reviewed)} onClick={approveAndSend}>{busy ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <Send aria-hidden="true" />}{needsApproval ? "Approve & Send Claim" : "Finish sending approved claim"}</Button></section>}
      {caseView.claimSentAt && <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-5"><div><p className="inline-flex items-center gap-2 text-sm font-semibold"><CheckCircle2 className="size-4 text-primary" aria-hidden="true" />Claim sent after merchant approval</p><p className="mt-1 text-sm text-muted">The supplier transport is simulated for this demo.</p></div><Button asChild variant="outline"><Link href={`/demo/supplier?caseId=${caseView.id}`}>Open demo supplier <ArrowRight aria-hidden="true" /></Link></Button></section>}
      {hasClaim ? <DiscrepancyResult key={`${caseView.status}:${caseView.messages.length}`} caseId={caseView.id} result={{ outcome: "discrepancy", message: "Source-grounded differences", discrepancies: caseView.discrepancies, totalPotentialRecoveryPaise: caseView.potentialRecoveryPaise }} approvalPending={needsApproval} showCaseLink={false} receivingAnchor={null} /> : caseView.status === "NO_DISCREPANCY" ? <DiscrepancyResult caseId={caseView.id} result={{ outcome: "clean", message: "Delivery looks correct. No claim required.", discrepancies: [] }} /> : <section className="rounded-2xl border border-border bg-surface p-6"><h2 className="font-semibold">No confirmed differences yet</h2><p className="mt-2 text-sm text-muted">Capture and confirm invoice, supplier promise and receiving facts before calculating a claim.</p><Button asChild variant="outline" className="mt-4"><Link href="/app/receive">Receive Stock</Link></Button></section>}
      <SupplierReplies caseView={caseView} />
    </div>
  );
}
