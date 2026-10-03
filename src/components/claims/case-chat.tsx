"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { LoaderCircle, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ClaimBackAgentUIMessage } from "@/lib/ai/agent";

function replyText(value: string) {
  return value.split(/(\*\*[^*]+\*\*)/g).map((part, index) =>
    part.startsWith("**") && part.endsWith("**")
      ? <strong key={index} className="font-semibold">{part.slice(2, -2)}</strong>
      : part,
  );
}

export function CaseChat({ caseId, compact = false, onUseAsNote }: { caseId: string | null; compact?: boolean; onUseAsNote?: (text: string) => void }) {
  const [input, setInput] = useState("");
  const [copiedNoteId, setCopiedNoteId] = useState<string | null>(null);
  const transport = useMemo(() => new DefaultChatTransport<ClaimBackAgentUIMessage>({
    api: "/api/agent",
    body: caseId ? { caseId } : {},
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
    <section aria-label={caseId ? "Ask ClaimBack about this case" : "Chat with ClaimBack"} className={`rounded-xl border border-border bg-surface ${compact ? "p-3 sm:p-4" : "p-4 sm:p-5"}`}>
      <div className="flex items-center gap-2 text-sm font-semibold"><MessageCircle className="size-4 text-primary" aria-hidden="true" />{caseId ? "Ask ClaimBack about this case" : "Chat with ClaimBack"}</div>
      <p className="mt-1 text-xs leading-5 text-muted">{caseId ? "I can check saved evidence and explain what needs your attention. Messages here never approve or send a claim." : "Ask about the process. Add an invoice for case-specific answers."}</p>
      <div role="log" aria-label="Case assistant replies" aria-live="polite" className={`max-h-80 space-y-2 overflow-y-auto ${visibleMessages.length || !compact ? "mt-3" : ""}`}>
        {visibleMessages.length === 0 && !compact && <p className="rounded-2xl rounded-tl-sm bg-surface-soft p-3 text-sm leading-6">{caseId ? "Ask me “What do I need to confirm next?” or “What evidence do we have?”" : "Ask me “How do we check this delivery?” or “What should I add first?”"}</p>}
        {visibleMessages.map((message) => <div key={message.id} className={`rounded-2xl p-3 text-sm leading-6 ${message.role === "user" ? "ml-5 rounded-tr-sm bg-success-soft text-foreground" : "mr-5 rounded-tl-sm bg-surface-soft text-foreground"}`}><span className="mb-1 block text-xs font-semibold">{message.role === "user" ? "You" : "ClaimBack"}</span><span className="whitespace-pre-wrap">{message.role === "user" ? message.text : replyText(message.text)}</span>{message.role === "user" && onUseAsNote && <button type="button" className="mt-2 block text-xs font-semibold text-primary underline-offset-2 hover:underline" onClick={() => { onUseAsNote(message.text); setCopiedNoteId(message.id); }}>{copiedNoteId === message.id ? "Added to receiving note" : "Use as receiving note"}</button>}</div>)}
      </div>
      {working && <p role="status" className="mt-2 inline-flex items-center gap-2 text-xs text-primary"><LoaderCircle className="size-3.5 motion-safe:animate-spin" aria-hidden="true" />{caseId ? "Checking saved case…" : "Thinking through your delivery…"}</p>}
      {error && <p role="alert" className="mt-2 rounded-lg bg-danger-soft p-2 text-xs text-danger">ClaimBack is unavailable right now. Continue with the delivery below or retry your question.</p>}
      <form onSubmit={ask} className={`mt-3 flex gap-2 ${compact ? "flex-row" : "flex-col sm:flex-row"}`}>
        <label className="sr-only" htmlFor={`case-assistant-question-${caseId ?? "new"}`}>Ask ClaimBack</label>
        <input id={`case-assistant-question-${caseId ?? "new"}`} className="min-h-12 min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 text-base focus:border-primary focus:outline-none" value={input} onChange={(event) => setInput(event.target.value)} maxLength={4000} placeholder={caseId ? "Ask ClaimBack anything about this case…" : "Ask about this delivery…"} />
        <Button type="submit" variant="outline" disabled={!input.trim() || working}>Ask</Button>
      </form>
    </section>
  );
}
