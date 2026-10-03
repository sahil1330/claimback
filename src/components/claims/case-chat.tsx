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

export function CaseChat({ caseId }: { caseId: string }) {
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
    <section aria-label="Ask ClaimBack about this case" className="rounded-xl border border-border bg-surface p-4 sm:p-5">
      <div className="flex items-center gap-2 text-sm font-semibold"><MessageCircle className="size-4 text-primary" aria-hidden="true" />Ask ClaimBack about this case</div>
      <p className="mt-1 text-xs leading-5 text-muted">I can check saved evidence and explain what needs your attention. Messages here never approve or send a claim.</p>
      <div role="log" aria-label="Case assistant replies" aria-live="polite" className="mt-3 max-h-80 space-y-2 overflow-y-auto">
        {visibleMessages.length === 0 && <p className="rounded-2xl rounded-tl-sm bg-surface-soft p-3 text-sm leading-6">Ask me “What do I need to confirm next?” or “What evidence do we have?”</p>}
        {visibleMessages.map((message) => <div key={message.id} className={`rounded-2xl p-3 text-sm leading-6 ${message.role === "user" ? "ml-5 rounded-tr-sm bg-success-soft text-foreground" : "mr-5 rounded-tl-sm bg-surface-soft text-foreground"}`}><span className="mb-1 block text-xs font-semibold">{message.role === "user" ? "You" : "ClaimBack"}</span><span className="whitespace-pre-wrap">{message.role === "user" ? message.text : replyText(message.text)}</span></div>)}
      </div>
      {working && <p role="status" className="mt-2 inline-flex items-center gap-2 text-xs text-primary"><LoaderCircle className="size-3.5 motion-safe:animate-spin" aria-hidden="true" />Checking saved case…</p>}
      {error && <p role="alert" className="mt-2 rounded-lg bg-danger-soft p-2 text-xs text-danger">Case assistant is unavailable right now. Continue with the case below or retry your question.</p>}
      <form onSubmit={ask} className="mt-3 flex flex-col gap-2 sm:flex-row">
        <label className="sr-only" htmlFor={`case-assistant-question-${caseId}`}>Ask the case assistant</label>
        <input id={`case-assistant-question-${caseId}`} className="min-h-12 min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 text-base focus:border-primary focus:outline-none" value={input} onChange={(event) => setInput(event.target.value)} maxLength={4000} placeholder="Ask ClaimBack anything about this case…" />
        <Button type="submit" variant="outline" disabled={!input.trim() || working}>Ask</Button>
      </form>
    </section>
  );
}
