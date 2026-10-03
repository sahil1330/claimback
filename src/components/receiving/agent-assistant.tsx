"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { Bot, LoaderCircle, MessageCircle, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ClaimBackAgentUIMessage } from "@/lib/ai/agent";

type AgentAssistantProps = {
  caseId: string | null;
  canFill: boolean;
  busy: boolean;
  locked: boolean;
  note: string;
  onNoteChange: (note: string) => void;
  onFill: (note: string) => Promise<string>;
};

function CaseChat({ caseId }: { caseId: string }) {
  const [input, setInput] = useState("");
  const transport = useMemo(() => new DefaultChatTransport<ClaimBackAgentUIMessage>({
    api: "/api/agent",
    body: { caseId },
  }), [caseId]);
  const { messages, status, error, clearError, sendMessage } = useChat<ClaimBackAgentUIMessage>({ transport });
  const working = status === "submitted" || status === "streaming";
  const visibleMessages = messages.slice(-6).map((message) => ({
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
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-center gap-2 text-sm font-semibold"><MessageCircle className="size-4 text-primary" aria-hidden="true" />Ask about this case</div>
      <p className="mt-1 text-xs leading-5 text-muted">ClaimBack checks saved evidence and case progress. Chat is not merchant approval; sending a claim still requires approval in the case.</p>
      <div role="log" aria-label="Case assistant replies" aria-live="polite" className="mt-3 max-h-48 space-y-2 overflow-y-auto">
        {visibleMessages.length === 0 && <p className="rounded-lg bg-surface-soft p-3 text-xs text-muted">Try “What do I need to confirm next?”</p>}
        {visibleMessages.map((message) => <div key={message.id} className={`rounded-lg p-3 text-xs leading-5 ${message.role === "user" ? "ml-5 bg-success-soft text-foreground" : "mr-5 bg-surface-soft text-foreground"}`}><span className="mb-1 block font-semibold">{message.role === "user" ? "You" : "ClaimBack"}</span><span className="whitespace-pre-wrap">{message.text}</span></div>)}
      </div>
      {working && <p role="status" className="mt-2 inline-flex items-center gap-2 text-xs text-primary"><LoaderCircle className="size-3.5 motion-safe:animate-spin" aria-hidden="true" />Checking saved case…</p>}
      {error && <p role="alert" className="mt-2 rounded-lg bg-danger-soft p-2 text-xs text-danger">Case assistant is unavailable right now. Continue with the receiving form below or retry your question.</p>}
      <form onSubmit={ask} className="mt-3 flex flex-col gap-2 sm:flex-row">
        <label className="sr-only" htmlFor="case-assistant-question">Ask the case assistant</label>
        <input id="case-assistant-question" className="min-h-11 min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 text-sm focus:border-primary focus:outline-none" value={input} onChange={(event) => setInput(event.target.value)} maxLength={4000} placeholder="Ask about this case…" />
        <Button type="submit" variant="outline" disabled={!input.trim() || working}>Ask</Button>
      </form>
    </div>
  );
}

export function AgentAssistant({ caseId, canFill, busy, locked, note, onNoteChange, onFill }: AgentAssistantProps) {
  const [fillBusy, setFillBusy] = useState(false);
  const [fillMessage, setFillMessage] = useState<string | null>(null);
  const [fillError, setFillError] = useState<string | null>(null);

  async function fillFromNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canFill || !note.trim() || fillBusy || busy) return;
    setFillBusy(true);
    setFillMessage(null);
    setFillError(null);
    try {
      setFillMessage(await onFill(note.trim()));
    } catch (cause) {
      setFillError(cause instanceof Error ? cause.message : "Could not understand the note. Enter the counts manually below.");
    } finally {
      setFillBusy(false);
    }
  }

  return (
    <section id="receiving-assistant" aria-labelledby="receiving-assistant-heading" className="rounded-2xl border border-primary/20 bg-success-soft/40 p-4 shadow-sm sm:p-5">
      <div className="flex items-start gap-3"><span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-success-soft text-primary"><Bot className="size-5" aria-hidden="true" /></span><div><h2 id="receiving-assistant-heading" className="text-base font-semibold">AI receiving assistant</h2><p className="mt-1 text-sm leading-6 text-muted">Upload the invoice and supplier promise, then type or speak what arrived. AI can suggest the form counts; you review and confirm them.</p></div></div>
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <form onSubmit={fillFromNote} className="rounded-xl border border-border bg-surface p-4">
          <label htmlFor="assistant-receiving-note" className="flex items-center gap-2 text-sm font-semibold"><Sparkles className="size-4 text-primary" aria-hidden="true" />Tell us what arrived</label>
          <textarea id="assistant-receiving-note" className="mt-2 min-h-24 w-full rounded-lg border border-border bg-surface p-3 text-sm focus:border-primary focus:outline-none disabled:opacity-60" value={note} disabled={busy || fillBusy || locked} onChange={(event) => { onNoteChange(event.target.value); setFillMessage(null); setFillError(null); }} maxLength={4000} placeholder="Maggi 48 boxes arrived, 3 free, 2 damaged…" />
          <Button type="submit" className="mt-2" disabled={!canFill || !note.trim() || busy || fillBusy}>{fillBusy && <LoaderCircle className="size-4 motion-safe:animate-spin" aria-hidden="true" />}Suggest form counts</Button>
          {!canFill && <p className="mt-2 text-xs text-muted">{locked ? "This receiving review is complete. Open the case to see the result." : "Finish the invoice and supplier promise steps to enable AI suggestions. You can type your note now."}</p>}
          {fillMessage && <p role="status" className="mt-2 rounded-lg bg-success-soft p-2 text-xs text-primary">{fillMessage}</p>}
          {fillError && <p role="alert" className="mt-2 rounded-lg bg-danger-soft p-2 text-xs text-danger">{fillError} Your note stays available for manual entry.</p>}
        </form>
        {caseId ? <CaseChat key={caseId} caseId={caseId} /> : <div className="rounded-xl border border-border bg-surface p-4"><div className="flex items-center gap-2 text-sm font-semibold"><MessageCircle className="size-4 text-primary" aria-hidden="true" />Ask about this case</div><p className="mt-3 rounded-lg bg-surface-soft p-3 text-xs leading-5 text-muted">Start with an invoice to create a case. The case assistant will appear here and help you understand the next step.</p></div>}
      </div>
    </section>
  );
}
