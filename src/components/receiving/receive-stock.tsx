"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { ArrowRight, Bot, Check, CheckCircle2, ChevronDown, FileCheck2, FilePlus2, LoaderCircle, Paperclip, Send, ShieldCheck, Sparkles, Volume2, X } from "lucide-react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { formatPaise } from "@/components/dashboard/metrics";
import { DiscrepancyResult } from "@/components/claims/discrepancy-result";
import { loadRecoveryHistory, uploadRecoveryEvidence, verifyRecoveryEvidence, type RecoveryHistory, type RecoveryResult } from "@/components/claims/recovery/api";
import type { ClaimBackAgentUIMessage } from "@/lib/ai/agent";
import { matchFactLines } from "@/lib/ai/match-facts";
import type { AgreementFacts, InvoiceFacts, ReceivingFacts } from "@/types/domain";
import {
  confirmAgreementSource, confirmInvoiceSource, createReceivingCase, extractAgreement,
  extractInvoice, extractReceiving, reconcileReceiving, uploadReceivingEvidence,
} from "./api";
import { initialReceivingDrafts, prepareCaseFacts, type ReceivingDraft } from "./prepare-facts";
import { SourceConfirmation, type SourceConfirmationSubmission } from "./source-confirmation";
import { VoiceReceivingNote } from "./voice-receiving-note";
import { useVoiceReply } from "./use-voice-reply";

type InvoiceResult = Awaited<ReturnType<typeof extractInvoice>>;
type AgreementResult = Awaited<ReturnType<typeof extractAgreement>>;
type ReceivingResult = Awaited<ReturnType<typeof extractReceiving>>;
type ReconcileResult = Awaited<ReturnType<typeof reconcileReceiving>>;
type Activity = { id: number; kind: "you" | "assistant" | "task"; text: string; detail?: string; state?: "running" | "done" | "error" };
type Phase = "invoice" | "invoice-confirm" | "promise" | "promise-confirm" | "receiving" | "counts" | "approval" | "supplier" | "recovery" | "resolved" | "clean";

const documentAccept = ".pdf,.txt,.png,.jpg,.jpeg,.webp,application/pdf,text/plain,image/png,image/jpeg,image/webp";
const fieldClass = "min-h-11 w-full rounded-lg border border-border bg-surface px-3 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20";
const scenariosSchema = z.object({ scenarios: z.array(z.object({ id: z.string(), name: z.string() })) });
const voiceLanguageSchema = z.enum(["en-IN", "hi-IN", "bn-IN", "ta-IN", "te-IN", "kn-IN", "ml-IN", "mr-IN", "gu-IN", "pa-IN", "od-IN"]);
const responseSchema = z.object({
  caseState: z.string(), acknowledgedPaise: z.number().int().safe(),
  response: z.object({ rawBody: z.string(), needsConfirmation: z.boolean(), decisions: z.array(z.object({
    discrepancyId: z.string(), outcome: z.string(), sourceExcerpt: z.string().nullable(),
    supplierAcknowledgedPaise: z.number().int().safe().nullable(), promisedForText: z.string().nullable(), uncertainty: z.string().nullable(),
  })) }).nullable(),
});
type DemoResponse = z.infer<typeof responseSchema>;

async function jsonResponse(response: Response): Promise<unknown> {
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const parsed = z.object({ error: z.string() }).safeParse(body);
    throw new Error(parsed.success ? parsed.data.error : `Request failed (${response.status})`);
  }
  return body;
}

function inlineEmphasis(value: string) {
  return value.split(/(\*\*[^*]+\*\*)/g).map((part, index) => part.startsWith("**") && part.endsWith("**")
    ? <strong key={index} className="font-semibold">{part.slice(2, -2)}</strong>
    : part);
}

function SourceSummary({ facts, label }: { facts: InvoiceFacts | AgreementFacts; label: string }) {
  return <details className="mt-3 rounded-xl border border-border bg-surface text-sm"><summary className="flex min-h-11 cursor-pointer items-center justify-between gap-2 px-4 py-3 font-semibold marker:content-none">{label}: {facts.lines.length} {facts.lines.length === 1 ? "product" : "products"}<ChevronDown className="size-4 text-muted" aria-hidden="true" /></summary><ul className="divide-y divide-border border-t border-border">{facts.lines.map((line, index) => <li key={`${line.rawName}-${index}`} className="px-4 py-3"><div className="flex justify-between gap-3"><span className="font-medium">{line.rawName}</span><span className="font-mono tabular-nums">{line.unitPricePaise === null ? "Rate unclear" : formatPaise(BigInt(line.unitPricePaise))}</span></div><p className="mt-1 text-xs text-muted">{line.quantity ?? "?"} paid units · {line.source.sourceLabel}</p></li>)}</ul></details>;
}

export function ReceiveStock() {
  const [activities, setActivities] = useState<Activity[]>([{ id: 0, kind: "assistant", text: "Send me an invoice. I’ll read it, compare the supplier promise and what arrived, then show you any money at risk." }]);
  const nextActivityId = useRef(1);
  const activeChatActivityId = useRef<number | null>(null);
  const activeChatStartIndex = useRef(0);
  const activeChatVoiceLanguage = useRef<string | null>(null);
  const feedEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [supplierName, setSupplierName] = useState("");
  const [caseId, setCaseId] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [input, setInput] = useState("");
  const [voiceDraftLanguage, setVoiceDraftLanguage] = useState<string | null>(null);
  const [voiceReplyActivityId, setVoiceReplyActivityId] = useState<number | null>(null);
  const [receivingText, setReceivingText] = useState("");
  const [invoiceResult, setInvoiceResult] = useState<InvoiceResult | null>(null);
  const [agreementResult, setAgreementResult] = useState<AgreementResult | null>(null);
  const [receivingResult, setReceivingResult] = useState<ReceivingResult | null>(null);
  const [showCountReview, setShowCountReview] = useState(false);
  const [drafts, setDrafts] = useState<ReceivingDraft[]>([]);
  const [suggestedFields, setSuggestedFields] = useState<Set<string>>(() => new Set());
  const [countsConfirmed, setCountsConfirmed] = useState(false);
  const [supplierConfirmed, setSupplierConfirmed] = useState(false);
  const [result, setResult] = useState<ReconcileResult | null>(null);
  const [reviewedClaim, setReviewedClaim] = useState(false);
  const [claimSent, setClaimSent] = useState(false);
  const [scenarios, setScenarios] = useState<z.infer<typeof scenariosSchema>["scenarios"]>([]);
  const [scenarioId, setScenarioId] = useState("");
  const [supplierReply, setSupplierReply] = useState<DemoResponse | null>(null);
  const [recoveryHistory, setRecoveryHistory] = useState<RecoveryHistory | null>(null);
  const [recoveryResult, setRecoveryResult] = useState<RecoveryResult | null>(null);
  const [recoveryArtifactId, setRecoveryArtifactId] = useState<string | null>(null);
  const [recoveryType, setRecoveryType] = useState<"credit_note" | "corrected_invoice">("credit_note");
  const [selectedObligations, setSelectedObligations] = useState<string[]>([]);
  const [confirmedRecoveryLink, setConfirmedRecoveryLink] = useState(false);
  const [resolved, setResolved] = useState(false);

  const invoice = invoiceResult?.status === "ready" ? invoiceResult.facts : null;
  const agreement = agreementResult?.status === "ready" ? agreementResult.facts : null;
  const namesDiffer = Boolean(invoice?.supplierName && agreement?.supplierName && invoice.supplierName.trim().toLocaleLowerCase("en-IN") !== agreement.supplierName.trim().toLocaleLowerCase("en-IN"));
  const openObligations = recoveryHistory?.obligations.filter((item) => item.outstanding_paise > 0) ?? [];
  const phase: Phase = resolved ? "resolved" : result?.outcome === "clean" ? "clean" : claimSent ? openObligations.length > 0 ? "recovery" : "supplier" : result?.outcome === "discrepancy" ? "approval" : agreementResult?.status === "needs_confirmation" ? "promise-confirm" : invoiceResult?.status === "needs_confirmation" ? "invoice-confirm" : !invoice ? "invoice" : !agreement ? "promise" : receivingResult ? "counts" : "receiving";
  const transport = useMemo(() => new DefaultChatTransport<ClaimBackAgentUIMessage>({ api: "/api/agent", body: caseId ? { caseId } : {} }), [caseId]);
  const { messages, status: chatStatus, error: chatError, sendMessage } = useChat<ClaimBackAgentUIMessage>({ transport });
  const { speak, replay, stop, status: voiceReplyStatus, error: voiceReplyError, hasAudio } = useVoiceReply();

  useEffect(() => { feedEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, [activities, phase]);
  useEffect(() => {
    const id = activeChatActivityId.current;
    if (id === null) return;
    const answer = [...messages.slice(activeChatStartIndex.current)].reverse().find((message) => message.role === "assistant");
    const text = answer?.parts.filter((part) => part.type === "text").map((part) => part.text).join("\n") ?? "";
    if (text) setActivities((current) => current.map((item) => item.id === id ? { ...item, text, state: chatStatus === "ready" ? "done" : "running" } : item));
    if (chatStatus === "error" || chatError) {
      setActivities((current) => current.map((item) => item.id === id ? { ...item, text: "I couldn’t answer just now. Please try again.", state: "error" } : item));
      activeChatActivityId.current = null;
      activeChatVoiceLanguage.current = null;
    } else if (chatStatus === "ready") {
      if (!text) setActivities((current) => current.map((item) => item.id === id ? { ...item, text: "I couldn’t answer just now. Please try again.", state: "error" } : item));
      else if (activeChatVoiceLanguage.current) {
        setVoiceReplyActivityId(id);
        void speak(text, activeChatVoiceLanguage.current);
      }
      activeChatActivityId.current = null;
      activeChatVoiceLanguage.current = null;
    }
  }, [messages, chatStatus, chatError, speak]);
  useEffect(() => {
    if (!claimSent) return;
    let active = true;
    fetch("/api/demo/supplier-response").then(jsonResponse).then((body) => scenariosSchema.parse(body).scenarios).then((items) => {
      if (active) { setScenarios(items); setScenarioId(items[0]?.id ?? ""); }
    }).catch(() => { if (active) setScenarios([]); });
    return () => { active = false; };
  }, [claimSent]);

  function add(kind: Activity["kind"], text: string, state?: Activity["state"], detail?: string) {
    const id = nextActivityId.current++;
    setActivities((current) => [...current, { id, kind, text, state, detail }]);
    return id;
  }
  function addReply(text: string, voiceLanguage: string | null = null) {
    const id = add("assistant", text);
    if (voiceLanguage) {
      stop();
      setVoiceReplyActivityId(id);
      void speak(text, voiceLanguage, true);
    }
    return id;
  }
  function update(id: number, changes: Partial<Activity>) {
    setActivities((current) => current.map((item) => item.id === id ? { ...item, ...changes } : item));
  }
  async function track<T>(label: string, operation: () => Promise<T>): Promise<T> {
    const id = add("task", label, "running");
    try {
      const value = await operation();
      update(id, { state: "done" });
      return value;
    } catch (cause) {
      update(id, { state: "error" });
      throw cause;
    }
  }
  function fail(cause: unknown, fallback: string) {
    const message = cause instanceof Error ? cause.message : fallback;
    setError(message);
    add("assistant", `I couldn’t finish that step: ${message} You can retry here.`);
  }
  function resetFile() {
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function runInvoice(invoiceFile: File) {
    if (!supplierName.trim()) { setError("Add the supplier name beside the invoice before sending."); return; }
    setBusy("invoice"); setError(null);
    add("you", `Invoice: ${invoiceFile.name}`);
    try {
      const id = caseId ?? await track("Opening a delivery case", () => createReceivingCase(supplierName.trim()));
      if (!caseId) setCaseId(id);
      const artifact = await track("Uploading invoice evidence", () => uploadReceivingEvidence(id, "invoice", invoiceFile));
      const extracted = await track("Reading supplier, products and billed rates", () => extractInvoice(id, artifact.artifactId));
      setInvoiceResult(extracted);
      resetFile();
      if (extracted.status === "error") throw new Error(extracted.error.message);
      if (extracted.status === "needs_confirmation") add("assistant", "I found details that need your check before I use this invoice. Review the source card below.");
      else add("assistant", `Invoice understood. I found ${extracted.facts.lines.length} ${extracted.facts.lines.length === 1 ? "product" : "products"}. Add the supplier’s agreed rate, scheme or message next.`);
    } catch (cause) { fail(cause, "Invoice processing failed."); }
    finally { setBusy(null); }
  }

  async function runAgreement(promiseFile: File, noteToProcess?: string, voiceLanguage: string | null = null, clearComposer = false) {
    if (!caseId || !invoice) return;
    setBusy("promise"); setError(null);
    add("you", `Supplier promise: ${promiseFile.name}`);
    try {
      const artifact = await track("Saving the supplier promise", () => uploadReceivingEvidence(caseId, "agreement", promiseFile));
      const extracted = await track("Checking agreed rates and free units", () => extractAgreement(caseId, artifact.artifactId));
      setAgreementResult(extracted);
      resetFile();
      if (extracted.status === "error") throw new Error(extracted.error.message);
      if (clearComposer) setInput("");
      if (extracted.status === "needs_confirmation") addReply("A promise detail is uncertain. Please check it against the source before I compare the delivery.", voiceLanguage);
      else {
        setDrafts(initialReceivingDrafts(invoice, extracted.facts));
        addReply("Supplier promise understood. Tell me what actually arrived, or review the note you already sent.", noteToProcess?.trim() ? null : voiceLanguage);
        if (noteToProcess?.trim()) await processReceivingNote(noteToProcess.trim(), voiceLanguage);
      }
    } catch (cause) { fail(cause, "Promise processing failed."); }
    finally { setBusy(null); }
  }

  async function confirmInvoice(submission: SourceConfirmationSubmission) {
    if (!caseId || invoiceResult?.status !== "needs_confirmation") return;
    setBusy("confirming"); setError(null);
    try {
      const confirmed = await track("Saving your invoice corrections", () => confirmInvoiceSource(caseId, invoiceResult.facts.source.sourceArtifactId, submission));
      setInvoiceResult(confirmed);
      if (confirmed.status === "error") throw new Error(confirmed.error.message);
      if (confirmed.status === "ready") add("assistant", "Invoice facts confirmed. Add the supplier promise next.");
    } catch (cause) { fail(cause, "Invoice confirmation failed."); }
    finally { setBusy(null); }
  }
  async function confirmAgreement(submission: SourceConfirmationSubmission) {
    if (!caseId || !invoice || agreementResult?.status !== "needs_confirmation") return;
    setBusy("confirming"); setError(null);
    try {
      const confirmed = await track("Saving your promise corrections", () => confirmAgreementSource(caseId, agreementResult.facts.source.sourceArtifactId, submission));
      setAgreementResult(confirmed);
      if (confirmed.status === "error") throw new Error(confirmed.error.message);
      if (confirmed.status === "ready") {
        setDrafts(initialReceivingDrafts(invoice, confirmed.facts));
        add("assistant", "Promise facts confirmed. I’m ready to check what arrived.");
        if (receivingText.trim()) await processReceivingNote(receivingText.trim());
      }
    } catch (cause) { fail(cause, "Promise confirmation failed."); }
    finally { setBusy(null); }
  }

  function applySuggestions(facts: ReceivingFacts): number {
    if (!invoice) return 0;
    const candidates = invoice.lines.map((line, index) => ({ id: String(index), rawName: line.rawName, skuCode: line.skuRef, unit: line.unit, packSize: line.packSize }));
    const proposed = new Map<number, ReceivingFacts["lines"][number][]>();
    for (const { line, resolution } of matchFactLines(facts.lines, candidates)) {
      if (resolution.status !== "matched" || line.confidence !== "high") continue;
      if (!("receivedQuantity" in line)) continue;
      if ([line.receivedQuantity, line.receivedFreeQuantity, line.damagedQuantity].every((value) => value === null)) continue;
      if (line.uncertainties.some((item) => !["receivedQuantity", "receivedFreeQuantity", "damagedQuantity"].includes(item.field))) continue;
      const index = Number(resolution.match.candidate.id);
      proposed.set(index, [...(proposed.get(index) ?? []), line]);
    }
    const staged = new Map<number, Partial<ReceivingDraft>>();
    const marked = new Set<string>();
    for (const [index, lines] of proposed) {
      if (lines.length !== 1) continue;
      const line = lines[0];
      const values: Partial<ReceivingDraft> = {};
      for (const [field, sourceField] of [["paid", "receivedQuantity"], ["free", "receivedFreeQuantity"], ["damaged", "damagedQuantity"]] as const) {
        const value = line[sourceField];
        if (value === null || line.uncertainties.some((item) => item.field === sourceField)) continue;
        values[field] = String(value);
        marked.add(`${index}:${field}`);
      }
      if (Object.keys(values).length) staged.set(index, values);
    }
    setDrafts((current) => current.map((draft, index) => ({ ...draft, ...staged.get(index) })));
    setSuggestedFields(marked); setCountsConfirmed(false);
    return staged.size;
  }

  async function processReceivingNote(note: string, voiceLanguage: string | null = null) {
    if (!caseId || !invoice || !note.trim()) return;
    setBusy("receiving"); setError(null);
    setReceivingText(note.trim());
    setDrafts((current) => current.map((draft, index) => ({ ...draft,
      paid: suggestedFields.has(`${index}:paid`) ? "" : draft.paid,
      free: suggestedFields.has(`${index}:free`) ? "" : draft.free,
      damaged: suggestedFields.has(`${index}:damaged`) ? "" : draft.damaged,
    })));
    setSuggestedFields(new Set()); setCountsConfirmed(false); setResult(null); setReceivingResult(null);
    add("you", note.trim());
    try {
      const source = new File([note.trim()], "merchant-receiving.txt", { type: "text/plain" });
      const artifact = await track("Saving your receiving note", () => uploadReceivingEvidence(caseId, "other", source));
      const extracted = await track("Understanding the quantities that arrived", () => extractReceiving(caseId, artifact.artifactId));
      setReceivingResult(extracted);
      if (extracted.status === "error") throw new Error(extracted.error.message);
      const staged = applySuggestions(extracted.facts);
      setShowCountReview(true);
      addReply(staged ? `I suggested counts for ${staged} ${staged === 1 ? "product" : "products"}. Please check every number against the stock in front of you.` : "I couldn’t confidently match the note to every product. Enter your actual counts in the review below.", voiceLanguage);
      setInput("");
    } catch (cause) { fail(cause, "Receiving note processing failed."); }
    finally { setBusy(null); }
  }
  function updateDraft(index: number, changes: Partial<ReceivingDraft>) {
    setDrafts((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...changes } : item));
    setSuggestedFields((current) => { const next = new Set(current); for (const field of ["paid", "free", "damaged"]) if (field in changes) next.delete(`${index}:${field}`); return next; });
    setCountsConfirmed(false); setResult(null);
  }
  async function runReconciliation() {
    if (!caseId || !invoice || !agreement) return;
    if (!countsConfirmed) { setError("Confirm that you counted the paid, free and damaged units."); return; }
    if (namesDiffer && !supplierConfirmed) { setError("Confirm that both documents refer to the same supplier."); return; }
    setBusy("reconcile"); setError(null);
    try {
      const input = prepareCaseFacts(caseId, invoice, agreement, drafts);
      const next = await track("Comparing promised, billed and received facts", () => reconcileReceiving(caseId, input));
      setResult(next);
      if (next.outcome === "discrepancy") add("assistant", `I found ${next.discrepancies.length} source-grounded ${next.discrepancies.length === 1 ? "difference" : "differences"} worth ${formatPaise(BigInt(next.totalPotentialRecoveryPaise))}. I prepared the evidence for your review. I will wait for your approval before sending anything.`);
      else add("assistant", "Some facts still need confirmation before I can calculate a claim.");
    } catch (cause) { fail(cause, "Delivery check failed."); }
    finally { setBusy(null); }
  }
  async function approveAndSend() {
    if (!caseId || !reviewedClaim || result?.outcome !== "discrepancy") return;
    setBusy("approval"); setError(null);
    try {
      await track("Recording your approval and sending the claim", async () => jsonResponse(await fetch(`/api/cases/${caseId}/approve`, { method: "POST" })));
      setClaimSent(true);
      add("assistant", "Your approval is recorded. I sent the claim through the demo supplier transport. The supplier’s reply is simulated here; any promised credit will stay open until we check later evidence.");
    } catch (cause) { fail(cause, "Claim could not be sent."); }
    finally { setBusy(null); }
  }
  async function triggerSupplier() {
    if (!caseId || !scenarioId) return;
    setBusy("supplier"); setError(null);
    try {
      const next = await track("Receiving and interpreting a simulated supplier reply", async () => responseSchema.parse(await jsonResponse(await fetch("/api/demo/supplier-response", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ caseId, scenarioId }) }))));
      setSupplierReply(next);
      if (next.response) add("assistant", `Supplier replied: “${next.response.rawBody}”`, "done", next.acknowledgedPaise > 0 ? `${formatPaise(BigInt(next.acknowledgedPaise))} acknowledged; credit still needs verification.` : "No recovery has been verified yet.");
      else add("assistant", "No supplier reply yet. The claim remains open. You can check for another simulated update.");
      const history = await track("Checking outstanding supplier commitments", () => loadRecoveryHistory(caseId));
      setRecoveryHistory(history);
    } catch (cause) { fail(cause, "Supplier response could not be checked."); }
    finally { setBusy(null); }
  }
  async function checkRecovery(document?: File) {
    if (!caseId) return;
    const artifactId = recoveryArtifactId;
    if (!document && !artifactId) return;
    setBusy("recovery"); setError(null);
    try {
      let id = artifactId;
      if (document) {
        add("you", `${recoveryType === "credit_note" ? "Credit note" : "Later invoice"}: ${document.name}`);
        const artifact = await track("Uploading later recovery evidence", () => uploadRecoveryEvidence(caseId, recoveryType, document));
        id = artifact.artifactId;
        setRecoveryArtifactId(id);
        resetFile();
      }
      if (!id) return;
      const next = await track("Checking the credit against the open commitment", () => verifyRecoveryEvidence({ caseId, artifactId: id, ...(selectedObligations.length ? { obligationIds: selectedObligations } : {}), ...(confirmedRecoveryLink ? { merchantConfirmedLink: true } : {}) }));
      setRecoveryResult(next);
      if (next.status === "error") throw new Error(next.error.message);
      if (next.status === "needs_confirmation") add("assistant", "I need you to confirm which commitment this document belongs to before I count any credit.");
      else {
        const history = await loadRecoveryHistory(caseId);
        setRecoveryHistory(history);
        setRecoveryArtifactId(null); setConfirmedRecoveryLink(false); setSelectedObligations([]);
        const verified = formatPaise(BigInt(next.verification.appliedPaise));
        const outstanding = formatPaise(BigInt(next.verification.outstandingPaise));
        add("assistant", next.verification.caseState === "RESOLVED" ? `${verified} verified from this evidence. The case is resolved.` : `${verified} verified from this evidence. ${outstanding} remains open; I’ll keep the commitment until later proof closes it.`);
        if (next.verification.caseState === "RESOLVED") setResolved(true);
      }
    } catch (cause) { fail(cause, "Recovery evidence check failed."); }
    finally { setBusy(null); }
  }

  async function askAgent(question: string, voiceLanguage: string | null) {
    if (voiceLanguage) { stop(); setVoiceReplyActivityId(null); }
    add("you", question);
    const id = add("assistant", "On it…", "running");
    activeChatActivityId.current = id;
    activeChatStartIndex.current = messages.length;
    activeChatVoiceLanguage.current = voiceLanguage;
    try { await sendMessage({ text: question }, voiceLanguage ? { body: { languageCode: voiceLanguage } } : undefined); }
    catch { update(id, { text: "I couldn’t answer that right now. Please retry.", state: "error" }); activeChatActivityId.current = null; activeChatVoiceLanguage.current = null; }
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || chatStatus === "streaming" || chatStatus === "submitted") return;
    const text = input.trim();
    if (phase === "invoice" && file) { void runInvoice(file); return; }
    if (phase === "promise" && file) { void runAgreement(file, receivingText); return; }
    if (phase === "recovery" && file) { void checkRecovery(file); return; }
    if (text) { setInput(""); setVoiceDraftLanguage(null); void askAgent(text, voiceDraftLanguage); }
  }
  function useAsEvidence() {
    const text = input.trim();
    if (!text || busy) return;
    const spokenLanguage = voiceDraftLanguage;
    setVoiceDraftLanguage(null);
    if (phase === "invoice") {
      setReceivingText(text);
      add("you", text);
      addReply("I have your arrival details for this session. Send the invoice and supplier promise, then I’ll check the quantities with you.", spokenLanguage);
      setInput("");
    } else if (phase === "promise") {
      void runAgreement(new File([text], "supplier-promise.txt", { type: "text/plain" }), receivingText, spokenLanguage, true);
    } else if (phase === "receiving" || phase === "counts") {
      void processReceivingNote(text, spokenLanguage);
    }
  }
  const evidenceAction = phase === "invoice" ? "Use as arrival note" : phase === "promise" ? "Use as supplier promise" : phase === "receiving" || phase === "counts" ? "Use as receiving note" : null;
  const composerHint = phase === "invoice" ? "Message ClaimBack, or attach an invoice…" : phase === "promise" ? "Message ClaimBack, or attach the supplier promise…" : phase === "receiving" || phase === "counts" ? "Message ClaimBack about this delivery…" : phase === "recovery" ? "Message ClaimBack, or attach later credit evidence…" : "Message ClaimBack about this case…";
  const canAttach = phase === "invoice" || phase === "promise" || phase === "recovery";
  const submitDisabled = Boolean(busy) || chatStatus === "streaming" || chatStatus === "submitted" || (!input.trim() && !file);

  return <div className="mx-auto max-w-4xl space-y-5 pb-12">
    <header className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Receive Stock</p><h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Let’s check this delivery.</h1><p className="mt-2 text-sm text-muted">One conversation from invoice to verified recovery.</p></div>{caseId && <Link href={`/app/cases/${caseId}`} className="text-xs font-semibold text-primary underline-offset-2 hover:underline">Open case record <ArrowRight className="inline size-3.5" aria-hidden="true" /></Link>}</header>
    <section aria-label="ClaimBack delivery conversation" className="overflow-hidden rounded-[1.5rem] border border-border bg-surface shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-border bg-[#123f2d] px-4 py-4 text-white sm:px-6"><div className="flex items-center gap-3"><span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/15"><Bot className="size-5" aria-hidden="true" /></span><div><h2 className="text-sm font-semibold">ClaimBack</h2><p className="text-xs text-white/70">Your margin protection teammate</p></div></div><span className="rounded-full border border-white/20 px-3 py-1 text-xs font-medium text-white/85">{phase === "resolved" ? "Recovered" : phase === "clean" ? "Checked" : claimSent ? "Tracking recovery" : caseId ? "Working on delivery" : "Ready"}</span></div>
      <div role="log" aria-label="Delivery progress and messages" aria-live="polite" aria-relevant="additions text" className="max-h-[45vh] min-h-44 space-y-4 overflow-y-auto px-4 py-6 sm:max-h-[min(55vh,600px)] sm:min-h-52 sm:px-8">
        {activities.map((item) => item.kind === "task" ? <div key={item.id} className="ml-10 flex items-start gap-2 text-sm text-muted"><span className="mt-0.5 flex size-5 shrink-0 items-center justify-center">{item.state === "running" ? <LoaderCircle className="size-4 animate-spin text-primary" aria-hidden="true" /> : item.state === "error" ? <X className="size-4 text-danger" aria-hidden="true" /> : <Check className="size-4 text-primary" aria-hidden="true" />}</span><span>{item.text}</span></div> : <div key={item.id} className={`flex ${item.kind === "you" ? "justify-end" : "items-start gap-3"}`}>{item.kind === "assistant" && <span className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-full bg-success-soft text-primary"><Sparkles className="size-4" aria-hidden="true" /></span>}<div className={`max-w-[min(90%,42rem)] rounded-2xl px-4 py-3 text-sm leading-6 ${item.kind === "you" ? "rounded-tr-sm bg-success-soft" : "rounded-tl-sm bg-surface-soft"}`}>{item.state === "running" && <LoaderCircle className="mr-2 inline size-4 animate-spin text-primary" aria-hidden="true" />}<p className="whitespace-pre-wrap">{item.kind === "assistant" ? inlineEmphasis(item.text) : item.text}</p>{item.detail && <p className="mt-2 text-xs text-muted">{item.detail}</p>}{item.id === voiceReplyActivityId && <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-primary">{voiceReplyStatus === "generating" && <><LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />Preparing voice reply…</>}{voiceReplyStatus === "playing" && <span role="status">Speaking…</span>}{hasAudio && <button type="button" className="inline-flex min-h-8 items-center gap-1 rounded-md px-2 font-semibold hover:bg-primary/10" onClick={() => void replay()} aria-label="Replay ClaimBack voice reply"><Volume2 className="size-4" aria-hidden="true" />Replay</button>}{voiceReplyError && <span role="status" className="text-muted">{voiceReplyError}</span>}</div>}</div></div>)}
        <div ref={feedEndRef} />
        {invoiceResult?.status === "needs_confirmation" && caseId && <div className="ml-10"><SourceConfirmation key={invoiceResult.facts.source.sourceArtifactId} caseId={caseId} label="Invoice" facts={invoiceResult.facts} confirmations={invoiceResult.confirmations} busy={busy === "confirming"} onSubmit={confirmInvoice} /></div>}
        {agreementResult?.status === "needs_confirmation" && caseId && <div className="ml-10"><SourceConfirmation key={agreementResult.facts.source.sourceArtifactId} caseId={caseId} label="Supplier promise" facts={agreementResult.facts} confirmations={agreementResult.confirmations} busy={busy === "confirming"} onSubmit={confirmAgreement} /></div>}
        {invoice && result?.outcome !== "discrepancy" && <div className="ml-10"><SourceSummary facts={invoice} label="Invoice evidence" /></div>}
        {agreement && result?.outcome !== "discrepancy" && <div className="ml-10"><SourceSummary facts={agreement} label="Supplier promise evidence" /></div>}
        {invoice && agreement && (!result || result.outcome === "needs_confirmation") && !showCountReview && <div className="ml-10"><button type="button" className="min-h-11 rounded-lg border border-border px-4 text-xs font-semibold text-primary hover:border-primary" onClick={() => setShowCountReview(true)}>Enter counts manually</button></div>}
        {invoice && agreement && (!result || result.outcome === "needs_confirmation") && showCountReview && <div className="ml-10 space-y-4 rounded-2xl border border-primary/20 bg-[#f7faf7] p-4 sm:p-5"><div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" /><div><h3 className="font-semibold">Confirm what arrived</h3><p className="mt-1 text-xs leading-5 text-muted">I can suggest counts from your note. You verify each product before I calculate anything.</p></div></div>{receivingResult?.status === "ready" && <p className="rounded-lg bg-surface p-3 text-xs text-muted">Suggestions from your note are marked below. Correct any number that differs from your physical count.</p>}{invoice.lines.map((line, index) => { const draft = drafts[index]; if (!draft) return null; const promised = draft.promisedIndex === null ? null : agreement.lines[draft.promisedIndex]; return <div key={`${line.rawName}-${index}`} className="rounded-xl border border-border bg-surface p-4"><p className="text-sm font-semibold">{line.rawName}</p><label className="mt-3 block text-xs font-semibold">Matching promise<select className={`${fieldClass} mt-1`} value={draft.promisedIndex ?? ""} onChange={(event) => updateDraft(index, { promisedIndex: event.target.value === "" ? null : Number(event.target.value), matchConfirmed: false })}><option value="">Choose product</option>{agreement.lines.map((option, optionIndex) => <option key={optionIndex} value={optionIndex}>{option.rawName}</option>)}</select></label>{promised && <label className="mt-3 flex items-start gap-2 text-xs text-muted"><input type="checkbox" className="mt-0.5 accent-primary" checked={draft.matchConfirmed} onChange={(event) => updateDraft(index, { matchConfirmed: event.target.checked })} />I checked this product match against both sources</label>}<div className="mt-3 grid grid-cols-3 gap-2">{(["paid", "free", "damaged"] as const).map((field) => <label key={field} className="text-xs font-semibold capitalize">{field}{suggestedFields.has(`${index}:${field}`) && <span className="ml-1 text-primary">suggested</span>}<input className={`${fieldClass} mt-1 px-2 font-mono`} inputMode="numeric" pattern="[0-9]*" value={draft[field]} onChange={(event) => updateDraft(index, { [field]: event.target.value })} placeholder="0" /></label>)}</div></div>; })}{namesDiffer && <label className="flex items-start gap-2 rounded-lg bg-warning-soft p-3 text-xs text-warning"><input type="checkbox" className="mt-0.5 accent-primary" checked={supplierConfirmed} onChange={(event) => setSupplierConfirmed(event.target.checked)} />Invoice says “{invoice.supplierName}” and promise says “{agreement.supplierName}”. I confirmed they are the same supplier.</label>}<label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1 accent-primary" checked={countsConfirmed} onChange={(event) => setCountsConfirmed(event.target.checked)} />I counted and confirmed the paid, free and damaged units above.</label><Button type="button" disabled={Boolean(busy) || !countsConfirmed} onClick={() => void runReconciliation()}>{busy === "reconcile" && <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />}Check delivery <ArrowRight className="size-4" aria-hidden="true" /></Button></div>}
        {caseId && result && <div className="ml-10"><DiscrepancyResult caseId={caseId} result={result} approvalPending={!claimSent} showCaseLink={false} showTimeline={false} compact receivingAnchor={null} /></div>}
        {phase === "approval" && <div className="ml-10 rounded-2xl border border-primary/25 bg-success-soft p-4 sm:p-5"><p className="font-semibold">Your approval is needed</p><p className="mt-1 text-sm text-muted">The draft uses only the sourced differences above. Nothing goes to the supplier until you approve.</p><label className="mt-4 flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1 accent-primary" checked={reviewedClaim} onChange={(event) => setReviewedClaim(event.target.checked)} />I reviewed the discrepancy amounts and linked evidence.</label><Button type="button" className="mt-4" disabled={!reviewedClaim || Boolean(busy)} onClick={() => void approveAndSend()}>{busy === "approval" ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Send className="size-4" aria-hidden="true" />}Approve and send claim</Button></div>}
        {claimSent && !resolved && <div className="ml-10 rounded-2xl border border-border bg-surface p-4 sm:p-5"><div className="flex items-start gap-2"><Bot className="mt-0.5 size-5 text-primary" aria-hidden="true" /><div><h3 className="font-semibold">Demo supplier response</h3><p className="mt-1 text-xs text-muted">Choose a stateful simulated reply. No real supplier is contacted.</p></div></div><div className="mt-4 flex flex-col gap-2 sm:flex-row"><label className="sr-only" htmlFor="supplier-scenario">Supplier response scenario</label><select id="supplier-scenario" className={`${fieldClass} flex-1`} value={scenarioId} onChange={(event) => setScenarioId(event.target.value)} disabled={Boolean(busy)}>{scenarios.length === 0 && <option value="">Loading scenarios…</option>}{scenarios.map((scenario) => <option key={scenario.id} value={scenario.id}>{scenario.name}</option>)}</select><Button type="button" variant="outline" disabled={!scenarioId || Boolean(busy)} onClick={() => void triggerSupplier()}>{busy === "supplier" && <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />}{supplierReply ? "Check next reply" : "Receive demo reply"}</Button></div>{supplierReply?.response && <p className="mt-3 text-xs text-warning">Supplier acceptance is a commitment. Only later evidence can close recovery.</p>}</div>}
        {claimSent && openObligations.length > 0 && !resolved && <div className="ml-10 rounded-2xl border border-warning/20 bg-warning-soft/40 p-4 sm:p-5"><h3 className="font-semibold">Recovery still to verify</h3><p className="mt-1 text-sm text-muted">A promised credit stays open until a later document proves it.</p><ul className="mt-3 space-y-2">{openObligations.map((item) => <li key={item.id} className="rounded-lg border border-border bg-surface p-3 text-sm"><label className="flex items-start gap-2"><input type="checkbox" className="mt-1 accent-primary" checked={selectedObligations.includes(item.id)} onChange={(event) => setSelectedObligations((current) => event.target.checked ? [...current, item.id] : current.filter((id) => id !== item.id))} /><span><strong>{formatPaise(BigInt(item.outstanding_paise))} outstanding</strong><span className="mt-1 block text-xs text-muted">{item.promise_text || "Supplier commitment"}</span></span></label></li>)}</ul><p className="mt-3 text-xs text-muted">Attach a credit note or later invoice in the composer. Select the matching commitment if more than one is open.</p><label className="mt-3 flex items-start gap-2 text-xs"><input type="checkbox" className="mt-0.5 accent-primary" checked={confirmedRecoveryLink} onChange={(event) => setConfirmedRecoveryLink(event.target.checked)} />I confirm this later document belongs to this purchase if it lacks the original invoice reference.</label>{recoveryResult?.status === "needs_confirmation" && <div className="mt-3 rounded-lg bg-surface p-3 text-xs text-warning"><p className="font-semibold">Please confirm before counting credit</p><ul className="mt-1 list-disc pl-4">{recoveryResult.confirmations.map((item) => <li key={item}>{item}</li>)}</ul><Button type="button" size="sm" className="mt-3" disabled={Boolean(busy) || !recoveryArtifactId} onClick={() => void checkRecovery()}>Retry with confirmation</Button></div>}{recoveryResult?.status === "verified" && <p className="mt-3 rounded-lg bg-surface p-3 text-sm">Verified now: <strong>{formatPaise(BigInt(recoveryResult.verification.appliedPaise))}</strong> · still owed: <strong>{formatPaise(BigInt(recoveryResult.verification.outstandingPaise))}</strong></p>}</div>}
        {resolved && <div className="ml-10 flex items-start gap-3 rounded-2xl border border-success/20 bg-success-soft p-5"><CheckCircle2 className="mt-0.5 size-5 text-success" aria-hidden="true" /><div><p className="font-semibold">Case closed after verified recovery</p><p className="mt-1 text-sm text-muted">The evidence and supplier commitment remain in the case record.</p></div></div>}
      </div>
      {error && <p role="alert" className="mx-4 mb-3 rounded-lg bg-danger-soft p-3 text-sm text-danger sm:mx-8">{error}</p>}
      <form onSubmit={submit} className="border-t border-border bg-[#fbfcfa] px-4 py-4 sm:px-6"><div className="mx-auto max-w-3xl"><div className="flex items-center justify-between gap-3"><p className="text-xs font-semibold text-primary">{phase === "invoice" ? "Start with the invoice" : phase === "promise" ? "Add the supplier promise" : phase === "receiving" || phase === "counts" ? "Tell me what arrived" : phase === "recovery" ? "Check later evidence" : "Continue the conversation"}</p><span className="text-xs text-muted">Ask, attach, or speak</span></div>{phase === "invoice" && file && <label className="mt-3 block text-xs font-semibold">Supplier name<input className={`${fieldClass} mt-1`} value={supplierName} maxLength={160} onChange={(event) => setSupplierName(event.target.value)} placeholder="e.g. North Star Pharma" /></label>}{phase === "recovery" && file && <label className="mt-3 block text-xs font-semibold">Document type<select className={`${fieldClass} mt-1`} value={recoveryType} onChange={(event) => setRecoveryType(event.target.value as "credit_note" | "corrected_invoice")}><option value="credit_note">Credit note</option><option value="corrected_invoice">Later or corrected invoice</option></select></label>}{file && <div className="mt-3 flex items-center justify-between gap-2 rounded-lg bg-success-soft px-3 py-2 text-xs"><span className="min-w-0 truncate font-semibold"><FileCheck2 className="mr-2 inline size-4" aria-hidden="true" />{file.name}</span><button type="button" className="flex size-8 shrink-0 items-center justify-center rounded-md hover:bg-primary/10" aria-label="Remove attachment" onClick={resetFile}><X className="size-4" aria-hidden="true" /></button></div>}<label htmlFor="delivery-message" className="sr-only">Message ClaimBack</label><textarea id="delivery-message" className="mt-3 min-h-20 w-full resize-y rounded-xl border border-border bg-surface px-4 py-3 text-base placeholder:text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20" value={input} onChange={(event) => setInput(event.target.value)} placeholder={composerHint} maxLength={4000} disabled={Boolean(busy)} /><div className="mt-2 flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2">{canAttach && <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-border bg-surface px-3 text-xs font-semibold hover:border-primary"><Paperclip className="size-4 text-primary" aria-hidden="true" />Attach {phase === "invoice" ? "invoice" : phase === "promise" ? "promise" : "evidence"}<input ref={fileInputRef} type="file" className="sr-only" accept={documentAccept} disabled={Boolean(busy)} onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></label>}<VoiceReceivingNote disabled={Boolean(busy)} onConfirm={(transcript, languageCode) => { setInput((current) => current.trim() ? `${current.trim()} ${transcript}` : transcript); setVoiceDraftLanguage(voiceLanguageSchema.safeParse(languageCode).data ?? "en-IN"); }} />{evidenceAction && input.trim() && !file && <button type="button" className="min-h-11 rounded-lg px-2 text-xs font-semibold text-primary hover:bg-success-soft" onClick={useAsEvidence}>{evidenceAction}</button>}</div><Button type="submit" disabled={submitDisabled}>{busy ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : file ? <FilePlus2 className="size-4" aria-hidden="true" /> : <ArrowRight className="size-4" aria-hidden="true" />}{file ? "Send file" : "Send"}</Button></div></div></form>
    </section>
  </div>;
}
