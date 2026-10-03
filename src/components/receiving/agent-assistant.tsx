"use client";

import { useState, type FormEvent } from "react";
import { Bot, LoaderCircle, MessageCircle, Mic, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CaseChat } from "@/components/claims/case-chat";
import { VoiceReceivingNote } from "./voice-receiving-note";

type AgentAssistantProps = {
  caseId: string | null;
  stage: "invoice" | "promise" | "stock" | "complete";
  canFill: boolean;
  busy: boolean;
  locked: boolean;
  note: string;
  onNoteChange: (note: string) => void;
  onFill: (note: string) => Promise<string>;
  onStepChange: (step: 0 | 1 | 2) => void;
};

const guidance = {
  invoice: "Let's check this delivery. Tell me what arrived by voice or text now, then add the invoice below.",
  promise: "Invoice understood. Add the supplier promise so I can compare what was agreed with what was billed.",
  stock: "Both sources are ready. Describe what arrived and I'll suggest counts for you to review.",
  complete: "Delivery checked. Ask me about the discrepancies, evidence, claim, or outstanding recovery.",
};

export function AgentAssistant({ caseId, stage, canFill, busy, locked, note, onNoteChange, onFill, onStepChange }: AgentAssistantProps) {
  const [fillBusy, setFillBusy] = useState(false);
  const [fillMessage, setFillMessage] = useState<string | null>(null);
  const [fillError, setFillError] = useState<string | null>(null);
  const [submittedNote, setSubmittedNote] = useState<string | null>(null);
  const visibleFillMessage = canFill && fillMessage?.startsWith("I've kept your note")
    ? "Your note is ready. Choose Suggest counts to have ClaimBack read it."
    : fillMessage;

  async function fillFromNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!note.trim() || fillBusy || busy || locked) return;
    setSubmittedNote(note.trim());
    if (!canFill) {
      setFillMessage("I've kept your note. Add the invoice and supplier promise, then I can suggest counts.");
      return;
    }
    setFillBusy(true);
    setFillMessage(null);
    setFillError(null);
    try {
      setFillMessage(await onFill(note.trim()));
      onStepChange(2);
    } catch (cause) {
      setFillError(cause instanceof Error ? cause.message : "Could not understand the note. Enter the counts manually below.");
    } finally {
      setFillBusy(false);
    }
  }

  return (
    <section id="receiving-assistant" aria-labelledby="receiving-assistant-heading" className="overflow-hidden rounded-[1.5rem] border border-primary/20 bg-surface shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 bg-[#123f2d] px-5 py-4 text-white sm:px-7"><div className="flex items-center gap-3"><span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/15"><Bot className="size-5" aria-hidden="true" /></span><div><h2 id="receiving-assistant-heading" className="text-base font-semibold">ClaimBack assistant</h2><p className="text-xs text-white/75">Talk through this delivery</p></div></div><span className="rounded-full border border-white/20 px-3 py-1 text-xs font-medium text-white/85">{caseId ? "Case connected" : "Start here"}</span></div>
      <div className="space-y-4 px-4 py-5 sm:px-7 sm:py-6">
        <div role="log" aria-label="Receiving conversation" aria-live="polite" className="space-y-3">
          <div className="flex items-start gap-2.5"><span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-success-soft text-primary"><Bot className="size-4" aria-hidden="true" /></span><p className="max-w-[85%] rounded-2xl rounded-tl-sm bg-surface-soft px-4 py-3 text-sm leading-6">{guidance[stage]}</p></div>
          {submittedNote && <div className="flex justify-end"><p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-tr-sm bg-success-soft px-4 py-3 text-sm leading-6">{submittedNote}</p></div>}
          {visibleFillMessage && <div className="flex items-start gap-2.5"><span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-success-soft text-primary"><Sparkles className="size-4" aria-hidden="true" /></span><p role="status" className="max-w-[85%] rounded-2xl rounded-tl-sm bg-surface-soft px-4 py-3 text-sm leading-6">{visibleFillMessage}</p></div>}
        </div>
        {fillError && <p role="alert" className="rounded-lg bg-danger-soft p-3 text-sm text-danger">{fillError} Your note stays available for manual entry.</p>}
        {!locked && <><VoiceReceivingNote disabled={busy || fillBusy} hasExistingNote={Boolean(note.trim())} onConfirm={(transcript) => { onNoteChange(transcript); setSubmittedNote(transcript); setFillMessage(canFill ? "Transcript confirmed. Choose Suggest counts to use this note." : "Transcript confirmed. Add the invoice and supplier promise next."); setFillError(null); }} compact />
        <form onSubmit={fillFromNote} className="rounded-xl border border-border bg-surface-soft p-3">
          <label htmlFor="assistant-receiving-note" className="flex items-center gap-2 text-sm font-semibold"><Mic className="size-4 text-primary" aria-hidden="true" />Describe what arrived</label>
          <textarea id="assistant-receiving-note" className="mt-2 min-h-20 w-full resize-y rounded-lg bg-transparent p-2 text-base text-foreground placeholder:text-muted focus:outline-none disabled:opacity-60" value={note} disabled={busy || fillBusy || locked} onChange={(event) => { onNoteChange(event.target.value); setFillMessage(null); setFillError(null); }} maxLength={4000} placeholder="48 boxes arrived, 3 free, 2 damaged…" />
          <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs text-muted">{canFill ? "AI suggests counts; you confirm them." : "Your note stays here while you add the evidence."}</p><Button type="submit" disabled={!note.trim() || busy || fillBusy || locked}>{fillBusy && <LoaderCircle className="size-4 motion-safe:animate-spin" aria-hidden="true" />}{canFill ? "Suggest counts" : "Keep note"}</Button></div>
        </form>
        </>}
        {caseId ? <CaseChat key={caseId} caseId={caseId} /> : <div className="rounded-xl border border-border bg-surface p-4"><div className="flex items-center gap-2 text-sm font-semibold"><MessageCircle className="size-4 text-primary" aria-hidden="true" />Ask ClaimBack about this case</div><p className="mt-2 text-sm leading-6 text-muted">Add an invoice below to start a case. Questions about its evidence and progress open immediately after that.</p></div>}
      </div>
    </section>
  );
}
