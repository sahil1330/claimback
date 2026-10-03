"use client";

import { useState } from "react";
import { ArrowRight, Check, FileText, LoaderCircle, MessageSquareText, PackageCheck, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatPaise } from "@/components/dashboard/metrics";
import type { AgreementFacts, InvoiceFacts, ReceivingFacts } from "@/types/domain";
import { DiscrepancyResult } from "@/components/claims/discrepancy-result";
import {
  createReceivingCase,
  extractAgreement,
  extractInvoice,
  extractReceiving,
  reconcileReceiving,
  uploadReceivingEvidence,
} from "./api";
import { initialReceivingDrafts, prepareCaseFacts, type ReceivingDraft } from "./prepare-facts";

type InvoiceResult = Awaited<ReturnType<typeof extractInvoice>>;
type AgreementResult = Awaited<ReturnType<typeof extractAgreement>>;
type ReceivingResult = Awaited<ReturnType<typeof extractReceiving>>;
type ReconcileResult = Awaited<ReturnType<typeof reconcileReceiving>>;
type Step = 0 | 1 | 2;

const steps = [
  { name: "Invoice", icon: FileText, detail: "What the supplier billed" },
  { name: "Supplier promise", icon: MessageSquareText, detail: "What was agreed" },
  { name: "Stock received", icon: PackageCheck, detail: "What actually arrived" },
] as const;

const fieldClass = "min-h-11 w-full rounded-lg border border-border bg-surface px-3 text-sm text-foreground file:mr-3 file:rounded-md file:border-0 file:bg-success-soft file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-primary focus:border-primary focus:outline-none";

function ProcessButton({ busy, children, disabled, onClick }: { busy: boolean; children: React.ReactNode; disabled?: boolean; onClick: () => void }) {
  return <Button type="button" onClick={onClick} disabled={busy || disabled}>{busy && <LoaderCircle className="animate-spin" aria-hidden="true" />}{children}</Button>;
}

function SourceStatus({ result, label }: { result: InvoiceResult | AgreementResult | null; label: string }) {
  if (!result) return null;
  if (result.status === "error") return <p role="alert" className="rounded-lg bg-danger-soft p-3 text-sm text-danger">{result.error.code === "MODEL_NOT_CONFIGURED" ? "AI extraction is unavailable until the model is configured." : result.error.message} Replace the source or retry when extraction is available.</p>;
  if (result.status === "needs_confirmation") {
    return (
      <div role="status" className="rounded-lg border border-warning/20 bg-warning-soft p-3 text-sm text-warning">
        <p className="font-semibold">{label} needs a clearer source before a claim can be calculated.</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">{result.confirmations.map((item, index) => <li key={`${item.field}-${index}`}>{item.reason} ({item.field})</li>)}</ul>
        <p className="mt-2">Choose another file or clearer text and run extraction again.</p>
      </div>
    );
  }
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
  const [busy, setBusy] = useState<"invoice" | "agreement" | "receiving" | "reconcile" | null>(null);
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
  const [drafts, setDrafts] = useState<ReceivingDraft[]>([]);
  const [countsConfirmed, setCountsConfirmed] = useState(false);
  const [supplierConfirmed, setSupplierConfirmed] = useState(false);
  const [result, setResult] = useState<ReconcileResult | null>(null);

  const invoice = invoiceResult?.status === "ready" ? invoiceResult.facts : null;
  const agreement = agreementResult?.status === "ready" ? agreementResult.facts : null;
  const completed = result !== null && result.outcome !== "needs_confirmation";
  const namesDiffer = Boolean(invoice?.supplierName && agreement?.supplierName && invoice.supplierName.trim().toLocaleLowerCase("en-IN") !== agreement.supplierName.trim().toLocaleLowerCase("en-IN"));

  function updateDraft(index: number, changes: Partial<ReceivingDraft>) {
    setDrafts((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...changes } : item));
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
      setAgreementResult(null); setDrafts([]); setReceivingResult(null);
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

  async function understandReceiving() {
    if (!caseId || !receivingText.trim()) { setError("Type what arrived before asking ClaimBack to understand it."); return; }
    setBusy("receiving"); setError(null);
    try {
      const file = new File([receivingText.trim()], "merchant-receiving.txt", { type: "text/plain" });
      const artifact = await uploadReceivingEvidence(caseId, "other", file);
      setReceivingResult(await extractReceiving(caseId, artifact.artifactId));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not understand the note. Enter counts below instead.");
    } finally { setBusy(null); }
  }

  function applySuggestions(facts: ReceivingFacts) {
    if (!invoice) return;
    setDrafts((current) => current.map((draft, index) => {
      const suggestion = facts.lines.find((line) => line.rawName.trim().toLocaleLowerCase("en-IN") === invoice.lines[index].rawName.trim().toLocaleLowerCase("en-IN"));
      return suggestion ? {
        ...draft,
        paid: suggestion.receivedQuantity === null ? draft.paid : String(suggestion.receivedQuantity),
        free: suggestion.receivedFreeQuantity === null ? draft.free : String(suggestion.receivedFreeQuantity),
        damaged: suggestion.damagedQuantity === null ? draft.damaged : String(suggestion.damagedQuantity),
      } : draft;
    }));
    setCountsConfirmed(false);
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
      <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Receive Stock</p><h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Check this delivery, step by step.</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-muted">Bring together the invoice, supplier promise and the stock you counted. Every difference stays linked to its source.</p></div>
      <div className="grid grid-cols-3 gap-2 lg:gap-4" aria-label="Receiving steps">
        {steps.map(({ name, icon: Icon, detail }, index) => <button key={name} type="button" disabled={index > (invoice ? agreement ? 2 : 1 : 0)} onClick={() => setStep(index as Step)} className={`rounded-xl border p-3 text-left transition-colors lg:p-4 ${step === index ? "border-primary bg-success-soft" : "border-border bg-surface"} disabled:opacity-60`}><span className="flex items-center gap-2 text-xs font-semibold sm:text-sm"><Icon className="size-4 shrink-0" aria-hidden="true" /><span>{name}</span></span><span className="mt-1 hidden text-xs text-muted lg:block">{detail}</span></button>)}
      </div>
      {error && <div role="alert" className="rounded-xl border border-danger/20 bg-danger-soft p-4 text-sm text-danger">{error}</div>}
      {busy && <p role="status" aria-live="polite" className="inline-flex items-center gap-2 text-sm font-medium text-primary"><LoaderCircle className="size-4 animate-spin" aria-hidden="true" />{busy === "invoice" ? "Uploading and understanding invoice…" : busy === "agreement" ? "Understanding supplier promise…" : busy === "receiving" ? "Understanding your receiving note…" : "Checking the three truths…"}</p>}
      <div className="grid items-start gap-5 lg:grid-cols-3">
        <section aria-labelledby="invoice-heading" className={`${step === 0 ? "block" : "hidden"} rounded-2xl border border-border bg-surface p-5 shadow-sm lg:block lg:p-6`}>
          <span className="flex size-10 items-center justify-center rounded-xl bg-success-soft text-primary"><FileText className="size-5" aria-hidden="true" /></span><h2 id="invoice-heading" className="mt-4 text-lg font-semibold">1. Invoice</h2><p className="mt-1 text-sm leading-6 text-muted">Upload the invoice PDF, photo or plain text.</p>
          <label className="mt-5 block text-xs font-semibold">Supplier name<Input className="mt-2" value={supplierName} maxLength={160} disabled={Boolean(caseId)} onChange={(event) => setSupplierName(event.target.value)} placeholder="e.g. North Star Pharma" /></label>
          <label className="mt-4 block text-xs font-semibold">Invoice file<input className={`${fieldClass} mt-2 py-2`} type="file" accept=".pdf,image/jpeg,image/png,image/webp,text/plain" onChange={(event) => setInvoiceFile(event.target.files?.[0] ?? null)} /></label>
          <label className="mt-2 block text-xs font-semibold text-primary">Or take an invoice photo<input className={`${fieldClass} mt-1 py-2`} type="file" accept="image/*" capture="environment" onChange={(event) => setInvoiceFile(event.target.files?.[0] ?? null)} /></label>
          <div className="mt-4"><ProcessButton busy={busy === "invoice"} disabled={Boolean(busy) || completed} onClick={runInvoice}><UploadCloud aria-hidden="true" />{caseId ? "Replace & understand invoice" : "Start review"}</ProcessButton></div>
          <div className="mt-5 space-y-4"><SourceStatus result={invoiceResult} label="Invoice" />{invoice && <FactLines facts={invoice} kind="invoice" />}</div>
        </section>
        <section aria-labelledby="agreement-heading" className={`${step === 1 ? "block" : "hidden"} rounded-2xl border border-border bg-surface p-5 shadow-sm lg:block lg:p-6`}>
          <span className="flex size-10 items-center justify-center rounded-xl bg-success-soft text-primary"><MessageSquareText className="size-5" aria-hidden="true" /></span><h2 id="agreement-heading" className="mt-4 text-lg font-semibold">2. Supplier promise</h2><p className="mt-1 text-sm leading-6 text-muted">Use the agreed message, rate or scheme as evidence.</p>
          <label className="mt-5 block text-xs font-semibold">Agreement file<input className={`${fieldClass} mt-2 py-2`} type="file" accept=".pdf,image/jpeg,image/png,image/webp,text/plain" disabled={!invoice} onChange={(event) => setAgreementFile(event.target.files?.[0] ?? null)} /></label>
          <label className="mt-2 block text-xs font-semibold text-primary">Or take a promise photo<input className={`${fieldClass} mt-1 py-2`} type="file" accept="image/*" capture="environment" disabled={!invoice} onChange={(event) => setAgreementFile(event.target.files?.[0] ?? null)} /></label>
          <p className="my-3 text-center text-xs font-semibold uppercase tracking-wider text-muted">or paste the message</p>
          <label className="block text-xs font-semibold">Supplier message<textarea className={`${fieldClass} mt-2 min-h-28 py-3`} value={agreementText} disabled={!invoice || Boolean(agreementFile)} onChange={(event) => setAgreementText(event.target.value)} placeholder="50 boxes at ₹428, 10+1 free units..." /></label>
          <div className="mt-4"><ProcessButton busy={busy === "agreement"} disabled={!invoice || Boolean(busy) || completed} onClick={runAgreement}><UploadCloud aria-hidden="true" />Understand promise</ProcessButton></div>
          <div className="mt-5 space-y-4"><SourceStatus result={agreementResult} label="Supplier promise" />{agreement && <FactLines facts={agreement} kind="promise" />}</div>
        </section>
        <section aria-labelledby="receiving-heading" className={`${step === 2 ? "block" : "hidden"} rounded-2xl border border-border bg-surface p-5 shadow-sm lg:block lg:p-6`}>
          <span className="flex size-10 items-center justify-center rounded-xl bg-success-soft text-primary"><PackageCheck className="size-5" aria-hidden="true" /></span><h2 id="receiving-heading" className="mt-4 text-lg font-semibold">3. Stock received</h2><p className="mt-1 text-sm leading-6 text-muted">Type what arrived, then confirm your actual counts below.</p>
          <label className="mt-5 block text-xs font-semibold">Receiving note (optional)<textarea className={`${fieldClass} mt-2 min-h-24 py-3`} value={receivingText} disabled={!agreement} onChange={(event) => setReceivingText(event.target.value)} placeholder="48 boxes arrived, 3 free, 2 damaged" /></label>
          <div className="mt-3"><ProcessButton busy={busy === "receiving"} disabled={!agreement || Boolean(busy) || completed} onClick={understandReceiving}>Understand note</ProcessButton></div>
          {receivingResult && <div className="mt-4 rounded-lg bg-surface-soft p-3 text-sm">{receivingResult.status === "error" ? <p role="alert">{receivingResult.error.message} Enter counts manually.</p> : <><p className="font-semibold">Suggested from your note</p><ul className="mt-2 space-y-1 text-xs text-muted">{receivingResult.facts.lines.map((line, index) => <li key={index}>{line.rawName}: {line.receivedQuantity ?? "?"} paid, {line.receivedFreeQuantity ?? "?"} free, {line.damagedQuantity ?? "?"} damaged</li>)}</ul><Button type="button" size="sm" variant="outline" className="mt-3" onClick={() => applySuggestions(receivingResult.facts)}>Use matching suggestions</Button><p className="mt-2 text-xs text-muted">Review every value before confirming.</p></>}</div>}
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
