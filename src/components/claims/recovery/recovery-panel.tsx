"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, Clock3, ExternalLink, FileCheck2, FileUp, RefreshCw, ShieldAlert } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { Button } from "@/components/ui/button";
import { formatPaise } from "@/components/dashboard/metrics";
import {
  loadRecoveryHistory,
  uploadRecoveryEvidence,
  verifyRecoveryEvidence,
  type RecoveryHistory,
  type RecoveryObligation,
  type RecoveryResult,
} from "./api";

type EvidenceType = "credit_note" | "corrected_invoice";

function money(paise: number) {
  return formatPaise(BigInt(paise));
}

function evidenceHref(caseId: string, artifactId: string) {
  return `/api/evidence?caseId=${encodeURIComponent(caseId)}&artifactId=${encodeURIComponent(artifactId)}`;
}

function Obligation({ item, checked, onToggle, canSelect }: {
  item: RecoveryObligation;
  checked: boolean;
  onToggle: () => void;
  canSelect: boolean;
}) {
  return (
    <li className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-start gap-3">
        {canSelect && item.outstanding_paise > 0 && (
          <input
            aria-label={`Apply later credit to obligation from ${new Date(item.created_at).toLocaleDateString("en-IN")}`}
            type="checkbox"
            checked={checked}
            onChange={onToggle}
            className="mt-1 size-4 accent-primary"
          />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-sm font-semibold">{item.promise_text || "Supplier recovery commitment"}</p>
              {item.promised_for && <p className="mt-1 text-xs text-muted">Expected: {item.promised_for}</p>}
            </div>
            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${item.outstanding_paise > 0 ? "bg-warning-soft text-warning" : "bg-success-soft text-success"}`}>
              {item.outstanding_paise > 0 ? "Still outstanding" : "Verified recovered"}
            </span>
          </div>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
            <div><dt className="text-xs text-muted">Promised</dt><dd className="mt-1 font-mono font-semibold tabular-nums">{money(item.original_amount_paise)}</dd></div>
            <div><dt className="text-xs text-muted">Verified recovered</dt><dd className="mt-1 font-mono font-semibold tabular-nums text-success">{money(item.recovered_paise)}</dd></div>
            <div><dt className="text-xs text-muted">Still owed</dt><dd className="mt-1 font-mono font-semibold tabular-nums text-warning">{money(item.outstanding_paise)}</dd></div>
          </dl>
        </div>
      </div>
    </li>
  );
}

function VerificationResult({ caseId, result }: { caseId: string; result: RecoveryResult }) {
  const reduceMotion = useReducedMotion();
  if (result.status === "error") {
    return <div role="alert" className="rounded-xl border border-danger/20 bg-danger-soft p-4 text-sm text-danger">{result.error.message} Try a clearer document or retry.</div>;
  }
  if (result.status === "needs_confirmation") {
    return (
      <div role="status" className="rounded-xl border border-warning/20 bg-warning-soft p-4">
        <p className="text-sm font-semibold">Confirmation needed before any credit counts</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted">{result.confirmations.map((item) => <li key={item}>{item}</li>)}</ul>
        {result.evidence.source.excerpt && <p className="mt-3 border-l-2 border-warning/40 pl-3 text-xs text-muted">Source: {result.evidence.source.excerpt}</p>}
      </div>
    );
  }

  const { verification, evidence } = result;
  const heading = verification.outcome === "missing"
    ? "No credit found in this evidence"
    : verification.outcome === "partial"
      ? "Partial credit verified"
      : verification.caseState === "RESOLVED"
        ? "Recovery verified · case resolved"
        : "Credit verified";
  const positive = verification.appliedPaise > 0;
  return (
    <motion.div
      role="status"
      initial={verification.caseState === "RESOLVED" && !reduceMotion ? { y: 4, scale: 0.995 } : false}
      animate={{ y: 0, scale: 1 }}
      transition={{ duration: reduceMotion ? 0 : 0.2, ease: "easeOut" }}
      className={`rounded-xl border p-4 ${positive ? "border-success/20 bg-success-soft" : "border-warning/20 bg-warning-soft"}`}
    >
      <div className="flex items-start gap-3">
        {positive ? <FileCheck2 className="mt-0.5 size-5 shrink-0 text-success" aria-hidden="true" /> : <Clock3 className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden="true" />}
        <div className="min-w-0">
          <p className="text-sm font-semibold">{heading}</p>
          {verification.alreadyApplied && <p className="mt-1 text-xs text-muted">This document was checked earlier. No credit was counted twice.</p>}
          <p className="mt-2 text-sm">Verified in this check: <strong className="font-mono tabular-nums">{money(verification.appliedPaise)}</strong></p>
          <p className="mt-1 text-sm">Case balance still owed: <strong className="font-mono tabular-nums">{money(verification.outstandingPaise)}</strong></p>
          {evidence.source.excerpt && <p className="mt-3 border-l-2 border-current/30 pl-3 text-xs text-muted">{evidence.source.excerpt}</p>}
          <a href={evidenceHref(caseId, verification.artifactId)} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1 text-xs font-semibold underline-offset-2 hover:underline">View checked evidence <ExternalLink className="size-3" aria-hidden="true" /></a>
        </div>
      </div>
    </motion.div>
  );
}

export function RecoveryPanel({ caseId, onRecoveryChange }: { caseId: string; onRecoveryChange?: () => void }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [history, setHistory] = useState<RecoveryHistory | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RecoveryResult | null>(null);
  const [type, setType] = useState<EvidenceType>("credit_note");
  const [file, setFile] = useState<File | null>(null);
  const [uploaded, setUploaded] = useState<{ artifactId: string; label: string } | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [confirmedLink, setConfirmedLink] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const next = await loadRecoveryHistory(caseId);
      setHistory(next);
      setLoadError(null);
    } catch (cause) {
      setLoadError(cause instanceof Error ? cause.message : "Could not load recovery history");
    }
  }, [caseId]);

  useEffect(() => {
    let active = true;
    loadRecoveryHistory(caseId).then((next) => {
      if (active) { setHistory(next); setLoadError(null); }
    }).catch((cause: unknown) => {
      if (active) setLoadError(cause instanceof Error ? cause.message : "Could not load recovery history");
    });
    return () => { active = false; };
  }, [caseId]);

  async function checkRecovery() {
    if ((!file && !uploaded) || busy) return;
    if (file && (file.size === 0 || file.size > 10 * 1024 * 1024)) {
      setError("Choose a document between 1 byte and 10 MB.");
      return;
    }
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const artifact = uploaded ?? await uploadRecoveryEvidence(caseId, type, file!);
      setUploaded(artifact);
      const next = await verifyRecoveryEvidence({
        caseId,
        artifactId: artifact.artifactId,
        ...(selectedIds.length ? { obligationIds: selectedIds } : {}),
        ...(confirmedLink ? { merchantConfirmedLink: true } : {}),
      });
      setResult(next);
      if (next.status === "verified") {
        await refresh();
        setFile(null);
        setUploaded(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
        onRecoveryChange?.();
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Recovery check failed. Please retry.");
    } finally {
      setBusy(false);
    }
  }

  function changeEvidence(nextFile: File | null) {
    setFile(nextFile);
    if (!nextFile && fileInputRef.current) fileInputRef.current.value = "";
    setUploaded(null);
    setResult(null);
    setError(null);
  }

  const openObligations = history?.obligations.filter((item) => item.outstanding_paise > 0) ?? [];
  const canCheck = Boolean(file || uploaded) && openObligations.length > 0;

  return (
    <section aria-labelledby="recovery-heading" className="rounded-2xl border border-border bg-surface p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-warning">Persistent supplier memory</p>
          <h2 id="recovery-heading" className="mt-1 text-xl font-semibold">Verify promised recovery</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">A supplier promise stays open until a later credit note or corrected invoice proves the recovery.</p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => void refresh()} disabled={busy}><RefreshCw aria-hidden="true" /> Refresh</Button>
      </div>

      {!history && !loadError && <p role="status" className="mt-6 text-sm text-muted">Loading obligations and verification history…</p>}
      {loadError && <div role="alert" className="mt-6 rounded-lg bg-danger-soft p-3 text-sm text-danger">{loadError} <button type="button" onClick={() => void refresh()} className="font-semibold underline">Retry</button></div>}

      {history && (
        <div className="mt-6 space-y-6">
          {history.obligations.length === 0 ? (
            <p className="rounded-xl bg-surface-soft p-4 text-sm text-muted">No supplier recovery commitment has been recorded for this case yet. Check the supplier response first.</p>
          ) : (
            <div>
              <h3 className="text-sm font-semibold">Supplier commitments</h3>
              <ul className="mt-3 space-y-3">{history.obligations.map((item) => <Obligation key={item.id} item={item} checked={selectedIds.includes(item.id)} canSelect={openObligations.length > 1} onToggle={() => setSelectedIds((current) => current.includes(item.id) ? current.filter((id) => id !== item.id) : [...current, item.id])} />)}</ul>
            </div>
          )}

          {openObligations.length > 0 ? (
            <div className="rounded-xl border border-border bg-surface-soft p-4 sm:p-5">
              <div className="flex items-start gap-3"><FileUp className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" /><div><h3 className="text-sm font-semibold">Check a later document</h3><p className="mt-1 text-xs leading-5 text-muted">Upload an issued credit note or later invoice. ClaimBack reads the document and applies only verified credit.</p></div></div>
              <div className="mt-4 grid gap-4 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)]">
                <label className="text-xs font-semibold">Document type
                  <select value={type} onChange={(event) => { setType(event.target.value as EvidenceType); changeEvidence(null); }} className="mt-2 block h-11 w-full rounded-lg border border-border bg-surface px-3 text-sm font-normal">
                    <option value="credit_note">Credit note</option><option value="corrected_invoice">Later or corrected invoice</option>
                  </select>
                </label>
                <label className="text-xs font-semibold">Evidence file
                  <input ref={fileInputRef} type="file" accept=".pdf,.txt,.png,.jpg,.jpeg,.webp,application/pdf,text/plain,image/png,image/jpeg,image/webp" onChange={(event) => changeEvidence(event.target.files?.[0] ?? null)} className="mt-2 block w-full rounded-lg border border-border bg-surface px-3 py-2 text-xs font-normal file:mr-3 file:rounded-md file:border-0 file:bg-success-soft file:px-3 file:py-1 file:font-semibold file:text-primary" />
                </label>
              </div>
              {openObligations.length > 1 && <p className="mt-3 text-xs text-muted">If this credit belongs to one of several commitments, select it above. ClaimBack will ask before applying an ambiguous credit.</p>}
              <label className="mt-4 flex items-start gap-2 text-xs leading-5 text-muted"><input type="checkbox" checked={confirmedLink} onChange={(event) => setConfirmedLink(event.target.checked)} className="mt-0.5 size-4 shrink-0 accent-primary" />I confirm this later document belongs to the purchase in this case if it does not print the original invoice reference.</label>
              <Button type="button" onClick={() => void checkRecovery()} disabled={!canCheck || busy} className="mt-4 w-full sm:w-auto">{busy ? "Checking evidence…" : uploaded ? "Retry check with confirmation" : "Check recovery evidence"}</Button>
              {error && <p role="alert" className="mt-3 text-sm text-danger">{error}</p>}
            </div>
          ) : history.obligations.length > 0 ? (
            <div className="flex items-start gap-3 rounded-xl border border-success/20 bg-success-soft p-4"><CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" aria-hidden="true" /><p className="text-sm font-semibold">Every recorded obligation has verified recovery.</p></div>
          ) : null}

          {result && <VerificationResult caseId={caseId} result={result} />}

          {history.verifications.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold">Evidence checks</h3>
              <ol className="mt-3 space-y-3">{history.verifications.map((item) => (
                <li key={item.artifact_id} className="flex items-start gap-3 rounded-lg border border-border p-3 text-sm">
                  {item.applied_paise > 0 ? <FileCheck2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" /> : <ShieldAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />}
                  <div className="min-w-0 flex-1"><p className="font-medium">{item.outcome === "missing" ? "No credit found" : `${money(item.applied_paise)} verified`}</p><p className="mt-1 text-xs text-muted">{item.evidence.source.sourceLabel} · {new Date(item.created_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</p>{item.evidence.source.excerpt && <p className="mt-1 line-clamp-2 text-xs text-muted">{item.evidence.source.excerpt}</p>}<a href={evidenceHref(caseId, item.artifact_id)} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-primary underline-offset-2 hover:underline">View evidence <ExternalLink className="size-3" aria-hidden="true" /></a></div>
                </li>
              ))}</ol>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
