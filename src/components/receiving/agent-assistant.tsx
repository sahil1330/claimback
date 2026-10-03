"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { Bot, LoaderCircle, MessageCircle, Mic, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ClaimBackAgentUIMessage } from "@/lib/ai/agent";
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

function CaseChat({ caseId }: { caseId: string }) {
  const [input, setInput] = useState("");
  const transport = useMemo(() => new DefaultChatTransport<ClaimBackAgentUIMessage>({
    api: "/api/agent",
    body: { caseId },
  }), [caseId]);
  const { messages, status, error, clearError, sendMessage } = useChat<ClaimBackAgentUIMessage>({ transport });
  const working = status === "submitted" || status === "streaming";
  const visibleMessages = messages.map((message) => ({
    id: message.id,
    role: message.role,
    text: message.parts.map((part) => part.type === "text" ? part.text : "").filter(Boolean).join("\n"),
  })).filter((message) => message.text);

  function ask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const question = input.trim();
    if (!question || working) return;
    clearError();
    setInput("");
    void sendMessage({ text: question }).catch(() => { setInput(question); });
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-4 sm:p-5">
      <div className="flex items-center gap-2 text-sm font-semibold"><MessageCircle className="size-4 text-primary" aria-hidden="true" />Ask ClaimBack about this case</div>
      <p className="mt-1 text-xs leading-5 text-muted">I can check saved evidence and explain what needs your attention. A supplier claim still needs your approval.</p>
      <div role="log" aria-label="Case assistant replies" aria-live="polite" className="mt-3 max-h-80 space-y-2 overflow-y-auto">
        {visibleMessages.length === 0 && <p className="rounded-2xl rounded-tl-sm bg-surface-soft p-3 text-sm leading-6">Ask me “What do I need to confirm next?” or “What evidence do we have?”</p>}
        {visibleMessages.map((message) => <div key={message.id} className={`rounded-2xl p-3 text-sm leading-6 ${message.role === "user" ? "ml-5 rounded-tr-sm bg-success-soft text-foreground" : "mr-5 rounded-tl-sm bg-surface-soft text-foreground"}`}><span className="mb-1 block text-xs font-semibold">{message.role === "user" ? "You" : "ClaimBack"}</span><span className="whitespace-pre-wrap">{message.text}</span></div>)}
      </div>
      {working && <p role="status" className="mt-2 inline-flex items-center gap-2 text-xs text-primary"><LoaderCircle className="size-3.5 motion-safe:animate-spin" aria-hidden="true" />Checking saved case…</p>}
      {error && <p role="alert" className="mt-2 rounded-lg bg-danger-soft p-2 text-xs text-danger">Case assistant is unavailable right now. Continue with the receiving form below or retry your question.</p>}
      <form onSubmit={ask} className="mt-3 flex flex-col gap-2 sm:flex-row">
        <label className="sr-only" htmlFor="case-assistant-question">Ask the case assistant</label>
        <input id="case-assistant-question" className="min-h-12 min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 text-base focus:border-primary focus:outline-none" value={input} onChange={(event) => setInput(event.target.value)} maxLength={4000} placeholder="Ask ClaimBack anything about this case…" />
        <Button type="submit" variant="outline" disabled={!input.trim() || working}>Ask</Button>
      </form>
    </div>
  );
}

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
        <form onSubmit={fillFromNote} className="rounded-xl border border-border bg-surface-soft p-3">
          <label htmlFor="assistant-receiving-note" className="flex items-center gap-2 text-sm font-semibold"><Mic className="size-4 text-primary" aria-hidden="true" />Describe what arrived</label>
          <textarea id="assistant-receiving-note" className="mt-2 min-h-20 w-full resize-y rounded-lg bg-transparent p-2 text-base text-foreground placeholder:text-muted focus:outline-none disabled:opacity-60" value={note} disabled={busy || fillBusy || locked} onChange={(event) => { onNoteChange(event.target.value); setFillMessage(null); setFillError(null); }} maxLength={4000} placeholder="48 boxes arrived, 3 free, 2 damaged…" />
          <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs text-muted">{canFill ? "AI suggests counts; you confirm them." : "Your note stays here while you add the evidence."}</p><Button type="submit" disabled={!note.trim() || busy || fillBusy || locked}>{fillBusy && <LoaderCircle className="size-4 motion-safe:animate-spin" aria-hidden="true" />}{canFill ? "Suggest counts" : "Keep note"}</Button></div>
        </form>
        <VoiceReceivingNote disabled={busy || fillBusy || locked} hasExistingNote={Boolean(note.trim())} onConfirm={(transcript) => { onNoteChange(transcript); setSubmittedNote(transcript); setFillMessage(canFill ? "Transcript confirmed. Choose Suggest counts to use this note." : "Transcript confirmed. Add the invoice and supplier promise next."); setFillError(null); }} compact />
        {caseId ? <CaseChat key={caseId} caseId={caseId} /> : <div className="rounded-xl border border-border bg-surface p-4"><div className="flex items-center gap-2 text-sm font-semibold"><MessageCircle className="size-4 text-primary" aria-hidden="true" />Ask ClaimBack about this case</div><p className="mt-2 text-sm leading-6 text-muted">Add an invoice below to start a case. Questions about its evidence and progress open immediately after that.</p></div>}
      </div>
    </section>
  );
}
