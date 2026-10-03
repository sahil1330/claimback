"use client";

import { useState } from "react";
import { ArrowRight, Check, FileText, LoaderCircle, MessageSquareText, PackageCheck, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatPaise } from "@/components/dashboard/metrics";
import type { AgreementFacts, InvoiceFacts, ReceivingFacts } from "@/types/domain";
import { DiscrepancyResult } from "@/components/claims/discrepancy-result";
import { matchFactLines } from "@/lib/ai/match-facts";
import {
  confirmAgreementSource,
  confirmInvoiceSource,
  createReceivingCase,
  extractAgreement,
  extractInvoice,
  extractReceiving,
  reconcileReceiving,
  uploadReceivingEvidence,
} from "./api";
import { initialReceivingDrafts, prepareCaseFacts, type ReceivingDraft } from "./prepare-facts";
import { AgentAssistant } from "./agent-assistant";
import { SourceConfirmation, type SourceConfirmationSubmission } from "./source-confirmation";

type InvoiceResult = Awaited<ReturnType<typeof extractInvoice>>;
type AgreementResult = Awaited<ReturnType<typeof extractAgreement>>;
type ReceivingResult = Awaited<ReturnType<typeof extractReceiving>>;
type ReconcileResult = Awaited<ReturnType<typeof reconcileReceiving>>;
type Step = 0 | 1 | 2;

const steps = [
  { name: "Invoice", icon: FileText, detail: "What the supplier billed" },
  { name: "Supplier promise", icon: MessageSquareText, detail: "What was agreed" },
  { name: "Stock received", icon: PackageCheck, detail: "Speak or type what arrived" },
] as const;

const fieldClass = "min-h-11 w-full rounded-lg border border-border bg-surface px-3 text-sm text-foreground file:mr-3 file:rounded-md file:border-0 file:bg-success-soft file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-primary focus:border-primary focus:outline-none";

function ProcessButton({ busy, children, disabled, onClick }: { busy: boolean; children: React.ReactNode; disabled?: boolean; onClick: () => void }) {
  return <Button type="button" onClick={onClick} disabled={busy || disabled}>{busy && <LoaderCircle className="animate-spin" aria-hidden="true" />}{children}</Button>;
}

function SourceStatus({ result, label }: { result: InvoiceResult | AgreementResult | null; label: string }) {
  if (!result) return null;
  if (result.status === "error") return <p role="alert" className="rounded-lg bg-danger-soft p-3 text-sm text-danger">{result.error.code === "MODEL_NOT_CONFIGURED" ? "AI extraction is unavailable until the model is configured." : result.error.message} Replace the source or retry when extraction is available.</p>;
  if (result.status === "needs_confirmation") return null;
  return <p className="inline-flex items-center gap-2 rounded-full bg-success-soft px-3 py-1.5 text-xs font-semibold text-primary"><Check className="size-4" aria-hidden="true" />{label} understood</p>;
}

function FactLines({ facts, kind }: { facts: InvoiceFacts | AgreementFacts; kind: "invoice" | "promise" }) {
  return (
    <ul className="divide-y divide-border rounded-xl border border-border">
      {facts.lines.map((line, index) => (
        <li key={`${line.rawName}-${index}`} className="p-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2"><strong className="font-semibold">{line.rawName}</strong><span className="font-mono font-semibold tabular-nums">{line.unitPricePaise === null ? "Rate unclear" : formatPaise(BigInt(line.unitPricePaise))}</span></div>
          <p className="mt-1 text-xs text-muted">{line.quantity ?? "?"} paid units{kind === "promise" && "scheme" in line && line.scheme ? ` · ${line.scheme.buyQuantity}+${line.scheme.freeQuantity} scheme` : ""} · {line.source.sourceLabel}</p>
          {(line.source.excerpt || line.source.locator) && <p className="mt-2 truncate font-mono text-[11px] text-muted">{line.source.excerpt || line.source.locator}</p>}
        </li>
      ))}
    </ul>
  );
}

export function ReceiveStock() {
  const [step, setStep] = useState<Step>(0);
  const [busy, setBusy] = useState<"invoice" | "agreement" | "confirmInvoice" | "confirmAgreement" | "receiving" | "reconcile" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [supplierName, setSupplierName] = useState("");
  const [caseId, setCaseId] = useState<string | null>(null);
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null);
  const [agreementFile, setAgreementFile] = useState<File | null>(null);
  const [agreementText, setAgreementText] = useState("");
  const [receivingText, setReceivingText] = useState("");
  const [invoiceResult, setInvoiceResult] = useState<InvoiceResult | null>(null);
  const [agreementResult, setAgreementResult] = useState<AgreementResult | null>(null);
  const [receivingResult, setReceivingResult] = useState<ReceivingResult | null>(null);
  const [suggestionMessage, setSuggestionMessage] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<ReceivingDraft[]>([]);
  const [suggestedFields, setSuggestedFields] = useState<Set<string>>(() => new Set());
  const [countsConfirmed, setCountsConfirmed] = useState(false);
  const [supplierConfirmed, setSupplierConfirmed] = useState(false);
  const [result, setResult] = useState<ReconcileResult | null>(null);

  const invoice = invoiceResult?.status === "ready" ? invoiceResult.facts : null;
  const agreement = agreementResult?.status === "ready" ? agreementResult.facts : null;
  const completed = result !== null && result.outcome !== "needs_confirmation";
  const namesDiffer = Boolean(invoice?.supplierName && agreement?.supplierName && invoice.supplierName.trim().toLocaleLowerCase("en-IN") !== agreement.supplierName.trim().toLocaleLowerCase("en-IN"));

  function updateDraft(index: number, changes: Partial<ReceivingDraft>) {
    setDrafts((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...changes } : item));
    setSuggestedFields((current) => {
      const next = new Set(current);
      for (const field of ["paid", "free", "damaged"]) {
        if (field in changes) next.delete(`${index}:${field}`);
      }
      return next;
    });
    setCountsConfirmed(false);
    setResult(null);
  }

  function changeReceivingNote(note: string) {
    setReceivingText(note);
    if (suggestedFields.size) {
      setDrafts((current) => current.map((draft, index) => ({
        ...draft,
        paid: suggestedFields.has(`${index}:paid`) ? "" : draft.paid,
        free: suggestedFields.has(`${index}:free`) ? "" : draft.free,
        damaged: suggestedFields.has(`${index}:damaged`) ? "" : draft.damaged,
      })));
      setSuggestedFields(new Set());
    }
    setReceivingResult(null);
    setSuggestionMessage(null);
    setCountsConfirmed(false);
    setResult(null);
  }

  async function runInvoice() {
    if (!invoiceFile) { setError("Choose an invoice file first."); return; }
    if (!supplierName.trim()) { setError("Enter the supplier name for this delivery."); return; }
    setBusy("invoice"); setError(null); setResult(null);
    try {
      const id = caseId ?? await createReceivingCase(supplierName.trim());
      if (!caseId) setCaseId(id);
      const artifact = await uploadReceivingEvidence(id, "invoice", invoiceFile);
      const extracted = await extractInvoice(id, artifact.artifactId);
      setInvoiceResult(extracted);
      setAgreementResult(null); setDrafts([]); setReceivingResult(null); setSuggestionMessage(null);
      if (extracted.status === "ready") setStep(1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not process the invoice. Retry with a clearer file.");
    } finally { setBusy(null); }
  }

  async function runAgreement() {
    if (!caseId || !invoice) return;
    const file = agreementFile ?? (agreementText.trim() ? new File([agreementText.trim()], "supplier-promise.txt", { type: "text/plain" }) : null);
    if (!file) { setError("Choose an agreement file or paste the supplier promise."); return; }
    setBusy("agreement"); setError(null); setResult(null);
    setReceivingResult(null); setSuggestionMessage(null); setCountsConfirmed(false);
    try {
      const artifact = await uploadReceivingEvidence(caseId, "agreement", file);
      const extracted = await extractAgreement(caseId, artifact.artifactId);
      setAgreementResult(extracted);
      if (extracted.status === "ready") {
        setDrafts(initialReceivingDrafts(invoice, extracted.facts));
        setStep(2);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not process the supplier promise. Retry with clearer evidence.");
    } finally { setBusy(null); }
  }

  async function confirmInvoice(submission: SourceConfirmationSubmission) {
    if (!caseId || invoiceResult?.status !== "needs_confirmation") return;
    setBusy("confirmInvoice"); setError(null); setResult(null);
    try {
      const confirmed = await confirmInvoiceSource(caseId, invoiceResult.facts.source.sourceArtifactId, submission);
      setInvoiceResult(confirmed);
      if (confirmed.status === "ready") {
        setAgreementResult(null); setDrafts([]); setReceivingResult(null); setSuggestionMessage(null);
        setStep(1);
      } else if (confirmed.status === "error") throw new Error(confirmed.error.message);
    } finally { setBusy(null); }
  }

  async function confirmAgreement(submission: SourceConfirmationSubmission) {
    if (!caseId || !invoice || agreementResult?.status !== "needs_confirmation") return;
    setBusy("confirmAgreement"); setError(null); setResult(null);
    try {
      const confirmed = await confirmAgreementSource(caseId, agreementResult.facts.source.sourceArtifactId, submission);
      setAgreementResult(confirmed);
      if (confirmed.status === "ready") {
        setDrafts(initialReceivingDrafts(invoice, confirmed.facts));
        setReceivingResult(null); setSuggestionMessage(null); setCountsConfirmed(false);
        setStep(2);
      } else if (confirmed.status === "error") throw new Error(confirmed.error.message);
    } finally { setBusy(null); }
  }

  async function understandReceiving(note: string): Promise<string> {
    if (!caseId || !invoice || !agreement || !note.trim()) {
      const message = "Finish the invoice and supplier promise, then describe what arrived.";
      setError(message);
      throw new Error(message);
    }
    changeReceivingNote(note.trim());
    setStep(2);
    setBusy("receiving"); setError(null);
    try {
      const file = new File([note.trim()], "merchant-receiving.txt", { type: "text/plain" });
      const artifact = await uploadReceivingEvidence(caseId, "other", file);
      const extracted = await extractReceiving(caseId, artifact.artifactId);
      setReceivingResult(extracted);
      if (extracted.status === "error") throw new Error(extracted.error.message);
      const staged = applySuggestions(extracted.facts);
      const summary = staged > 0
        ? `Suggested counts for ${staged} ${staged === 1 ? "product" : "products"} are in Stock received. Review each value and confirm your own count.`
        : "No product matched confidently. Review the parsed note and enter counts manually below.";
      setSuggestionMessage(summary);
      return summary;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Could not understand the note. Enter counts below instead.";
      setError(message);
      throw new Error(message);
    } finally { setBusy(null); }
  }

  function applySuggestions(facts: ReceivingFacts): number {
    if (!invoice) return 0;
    const invoiceCandidates = invoice.lines.map((line, index) => ({
      id: String(index), rawName: line.rawName, skuCode: line.skuRef, unit: line.unit, packSize: line.packSize,
    }));
    const proposed = new Map<number, ReceivingFacts["lines"][number][]>();
    for (const { line, resolution } of matchFactLines(facts.lines, invoiceCandidates)) {
      if (resolution.status !== "matched" || line.confidence !== "high") continue;
      if (!("receivedQuantity" in line) ||
        [line.receivedQuantity, line.receivedFreeQuantity, line.damagedQuantity].every((value) => value === null)) continue;
      const uncertainFields = new Set(line.uncertainties.map((item) => item.field));
      if ([...uncertainFields].some((field) => !["receivedQuantity", "receivedFreeQuantity", "damagedQuantity"].includes(field))) continue;
      const index = Number(resolution.match.candidate.id);
      const list = proposed.get(index) ?? [];
      list.push(line);
      proposed.set(index, list);
    }
    const staged = new Map<number, Partial<ReceivingDraft>>();
    const marked = new Set<string>();
    for (const [index, lines] of proposed) {
      if (lines.length !== 1) continue;
      const line = lines[0];
      const fields = [
        ["paid", "receivedQuantity"],
        ["free", "receivedFreeQuantity"],
        ["damaged", "damagedQuantity"],
      ] as const;
      const values: Partial<ReceivingDraft> = {};
      for (const [field, sourceField] of fields) {
        const value = line[sourceField];
        if (value === null || line.uncertainties.some((item) => item.field === sourceField)) continue;
        values[field] = String(value);
        marked.add(`${index}:${field}`);
      }
      if (Object.keys(values).length) staged.set(index, values);
    }
    setDrafts((current) => current.map((draft, index) => ({ ...draft, ...staged.get(index) })));
    setSuggestedFields(marked);
    setCountsConfirmed(false);
    setResult(null);
    return staged.size;
  }

  async function runReconciliation() {
    if (!caseId || !invoice || !agreement) return;
    if (!countsConfirmed) { setError("Confirm that you counted the paid, free and damaged units."); return; }
    if (namesDiffer && !supplierConfirmed) { setError("Confirm that both documents refer to the same supplier."); return; }
    setBusy("reconcile"); setError(null); setResult(null);
    try {
      const input = prepareCaseFacts(caseId, invoice, agreement, drafts);
      setResult(await reconcileReceiving(caseId, input));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not reconcile this delivery. Check the facts and retry.");
    } finally { setBusy(null); }
  }

  return (
    <div className="space-y-7">
      <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Receive Stock</p><h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Tell ClaimBack what arrived.</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-muted">Start by speaking or typing. Add the invoice and supplier promise as evidence, then confirm the counts before ClaimBack checks the delivery.</p></div>
      <AgentAssistant caseId={caseId} stage={completed ? "complete" : agreement ? "stock" : invoice ? "promise" : "invoice"} canFill={Boolean(invoice && agreement && !completed)} busy={Boolean(busy)} locked={completed} note={receivingText} onNoteChange={changeReceivingNote} onFill={understandReceiving} onStepChange={setStep} />
      <div className="grid grid-cols-3 gap-2 lg:gap-4" aria-label="Receiving steps">
        {steps.map(({ name, icon: Icon, detail }, index) => <button key={name} type="button" disabled={index > (invoice ? agreement ? 2 : 1 : 0)} onClick={() => setStep(index as Step)} className={`rounded-xl border p-3 text-left transition-colors lg:p-4 ${step === index ? "border-primary bg-success-soft" : "border-border bg-surface"} disabled:opacity-60`}><span className="flex items-center gap-2 text-xs font-semibold sm:text-sm"><Icon className="size-4 shrink-0" aria-hidden="true" /><span>{name}</span></span><span className="mt-1 hidden text-xs text-muted lg:block">{detail}</span></button>)}
      </div>
      {error && <div role="alert" className="rounded-xl border border-danger/20 bg-danger-soft p-4 text-sm text-danger">{error}</div>}
      {busy && <p role="status" aria-live="polite" className="inline-flex items-center gap-2 text-sm font-medium text-primary"><LoaderCircle className="size-4 animate-spin" aria-hidden="true" />{busy === "invoice" ? "Uploading and understanding invoice…" : busy === "agreement" ? "Understanding supplier promise…" : busy === "confirmInvoice" || busy === "confirmAgreement" ? "Saving confirmed source facts…" : busy === "receiving" ? "Understanding your receiving note…" : "Checking the three truths…"}</p>}
      <div className="grid items-start gap-5 lg:grid-cols-3">
        <section aria-labelledby="invoice-heading" className={`${step === 0 ? "block" : "hidden"} rounded-2xl border border-border bg-surface p-5 shadow-sm lg:block lg:p-6`}>
          <span className="flex size-10 items-center justify-center rounded-xl bg-success-soft text-primary"><FileText className="size-5" aria-hidden="true" /></span><h2 id="invoice-heading" className="mt-4 text-lg font-semibold">1. Invoice</h2><p className="mt-1 text-sm leading-6 text-muted">Upload the invoice PDF, photo or plain text.</p>
          <label className="mt-5 block text-xs font-semibold">Supplier name<Input className="mt-2" value={supplierName} maxLength={160} disabled={Boolean(caseId)} onChange={(event) => setSupplierName(event.target.value)} placeholder="e.g. North Star Pharma" /></label>
          <label className="mt-4 block text-xs font-semibold">Invoice file<input className={`${fieldClass} mt-2 py-2`} type="file" accept=".pdf,image/jpeg,image/png,image/webp,text/plain" onChange={(event) => setInvoiceFile(event.target.files?.[0] ?? null)} /></label>
          <label className="mt-2 block text-xs font-semibold text-primary">Or take an invoice photo<input className={`${fieldClass} mt-1 py-2`} type="file" accept="image/*" capture="environment" onChange={(event) => setInvoiceFile(event.target.files?.[0] ?? null)} /></label>
          <div className="mt-4"><ProcessButton busy={busy === "invoice"} disabled={Boolean(busy) || completed} onClick={runInvoice}><UploadCloud aria-hidden="true" />{caseId ? "Replace & understand invoice" : "Start review"}</ProcessButton></div>
          <div className="mt-5 space-y-4"><SourceStatus result={invoiceResult} label="Invoice" />{invoiceResult?.status === "needs_confirmation" && caseId && <SourceConfirmation key={invoiceResult.facts.source.sourceArtifactId} caseId={caseId} label="Invoice" facts={invoiceResult.facts} confirmations={invoiceResult.confirmations} busy={busy === "confirmInvoice"} onSubmit={confirmInvoice} />}{invoiceResult && invoiceResult.status !== "error" && <FactLines facts={invoiceResult.facts} kind="invoice" />}</div>
        </section>
        <section aria-labelledby="agreement-heading" className={`${step === 1 ? "block" : "hidden"} rounded-2xl border border-border bg-surface p-5 shadow-sm lg:block lg:p-6`}>
          <span className="flex size-10 items-center justify-center rounded-xl bg-success-soft text-primary"><MessageSquareText className="size-5" aria-hidden="true" /></span><h2 id="agreement-heading" className="mt-4 text-lg font-semibold">2. Supplier promise</h2><p className="mt-1 text-sm leading-6 text-muted">Use the agreed message, rate or scheme as evidence.</p>
          <label className="mt-5 block text-xs font-semibold">Agreement file<input className={`${fieldClass} mt-2 py-2`} type="file" accept=".pdf,image/jpeg,image/png,image/webp,text/plain" disabled={!invoice} onChange={(event) => setAgreementFile(event.target.files?.[0] ?? null)} /></label>
          <label className="mt-2 block text-xs font-semibold text-primary">Or take a promise photo<input className={`${fieldClass} mt-1 py-2`} type="file" accept="image/*" capture="environment" disabled={!invoice} onChange={(event) => setAgreementFile(event.target.files?.[0] ?? null)} /></label>
          <p className="my-3 text-center text-xs font-semibold uppercase tracking-wider text-muted">or paste the message</p>
          <label className="block text-xs font-semibold">Supplier message<textarea className={`${fieldClass} mt-2 min-h-28 py-3`} value={agreementText} disabled={!invoice || Boolean(agreementFile)} onChange={(event) => setAgreementText(event.target.value)} placeholder="50 boxes at ₹428, 10+1 free units..." /></label>
          <div className="mt-4"><ProcessButton busy={busy === "agreement"} disabled={!invoice || Boolean(busy) || completed} onClick={runAgreement}><UploadCloud aria-hidden="true" />Understand promise</ProcessButton></div>
          <div className="mt-5 space-y-4"><SourceStatus result={agreementResult} label="Supplier promise" />{agreementResult?.status === "needs_confirmation" && caseId && <SourceConfirmation key={agreementResult.facts.source.sourceArtifactId} caseId={caseId} label="Supplier promise" facts={agreementResult.facts} confirmations={agreementResult.confirmations} busy={busy === "confirmAgreement"} onSubmit={confirmAgreement} />}{agreementResult && agreementResult.status !== "error" && <FactLines facts={agreementResult.facts} kind="promise" />}</div>
        </section>
        <section aria-labelledby="receiving-heading" className={`${step === 2 ? "block" : "hidden"} rounded-2xl border border-border bg-surface p-5 shadow-sm lg:block lg:p-6`}>
          <span className="flex size-10 items-center justify-center rounded-xl bg-success-soft text-primary"><PackageCheck className="size-5" aria-hidden="true" /></span><h2 id="receiving-heading" className="mt-4 text-lg font-semibold">3. Confirm stock received</h2><p className="mt-1 text-sm leading-6 text-muted">Review ClaimBack’s suggestions against your actual count. You can correct each number here.</p>
          {receivingText && <p className="mt-4 rounded-lg bg-surface-soft p-3 text-xs leading-5 text-muted">Your note: {receivingText}</p>}
          {receivingResult && <div className="mt-4 rounded-lg bg-surface-soft p-3 text-sm">{receivingResult.status === "error" ? <p role="alert">{receivingResult.error.message} Enter counts manually.</p> : <><p className="font-semibold">Understood from your note</p><ul className="mt-2 space-y-1 text-xs text-muted">{receivingResult.facts.lines.map((line, index) => <li key={index}>{line.rawName}: {line.receivedQuantity ?? "?"} paid, {line.receivedFreeQuantity ?? "?"} free, {line.damagedQuantity ?? "?"} damaged</li>)}</ul>{receivingResult.facts.lines.flatMap((line) => line.uncertainties.map((item) => ({ product: line.rawName, ...item }))).map((item, index) => <p key={index} className="mt-2 text-xs text-warning">Please check {item.product} {item.field === "damagedQuantity" ? "damaged count" : item.field === "receivedFreeQuantity" ? "free count" : item.field === "receivedQuantity" ? "paid count" : "details"}: {item.reason}</p>)}{suggestionMessage && <p className="mt-2 text-xs text-primary">{suggestionMessage}</p>}</>}</div>}
          {invoice && agreement && <div className="mt-5 space-y-4">{invoice.lines.map((line, index) => { const draft = drafts[index]; if (!draft) return null; const promised = draft.promisedIndex === null ? null : agreement.lines[draft.promisedIndex]; return <div key={`${line.rawName}-${index}`} className="rounded-xl border border-border p-3"><p className="text-sm font-semibold">{line.rawName}</p><label className="mt-3 block text-xs font-semibold">Matches supplier promise<select className={`${fieldClass} mt-1`} value={draft.promisedIndex ?? ""} onChange={(event) => updateDraft(index, { promisedIndex: event.target.value === "" ? null : Number(event.target.value), matchConfirmed: false })}><option value="">Choose a product</option>{agreement.lines.map((option, optionIndex) => <option key={optionIndex} value={optionIndex}>{option.rawName}</option>)}</select></label>{promised && <label className="mt-3 flex items-start gap-2 text-xs text-muted"><input type="checkbox" className="mt-0.5 accent-primary" checked={draft.matchConfirmed} onChange={(event) => updateDraft(index, { matchConfirmed: event.target.checked })} />I confirmed this product match against both documents</label>}<div className="mt-4 grid grid-cols-3 gap-2">{(["paid", "free", "damaged"] as const).map((field) => <label key={field} className="text-xs font-semibold capitalize">{field}<input className={`${fieldClass} mt-1 px-2 font-mono`} inputMode="numeric" pattern="[0-9]*" value={draft[field]} onChange={(event) => updateDraft(index, { [field]: event.target.value })} placeholder={field === "free" && !promised?.scheme ? "—" : "0"} /></label>)}</div></div>; })}</div>}
          {namesDiffer && <label className="mt-4 flex items-start gap-2 rounded-lg bg-warning-soft p-3 text-xs text-warning"><input type="checkbox" className="mt-0.5 accent-primary" checked={supplierConfirmed} onChange={(event) => setSupplierConfirmed(event.target.checked)} />Invoice says “{invoice?.supplierName}” and promise says “{agreement?.supplierName}”. I confirmed these are the same supplier.</label>}
          {invoice && agreement && <label className="mt-4 flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1 accent-primary" checked={countsConfirmed} onChange={(event) => setCountsConfirmed(event.target.checked)} />I counted and confirmed the paid, free and damaged units above.</label>}
          <div className="mt-5"><ProcessButton busy={busy === "reconcile"} disabled={!invoice || !agreement || Boolean(busy) || completed} onClick={runReconciliation}>Check delivery <ArrowRight aria-hidden="true" /></ProcessButton></div>
        </section>
      </div>
      {caseId && result && <DiscrepancyResult caseId={caseId} result={result} />}
    </div>
  );
}
