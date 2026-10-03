import { createAgentUIStreamResponse, type UIMessage } from "ai";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClaimBackAgent } from "@/lib/ai/agent";
import { ModelConfigurationError } from "@/lib/ai/models";
import { CaseAccessError, assertCaseOwnership } from "@/lib/auth/case-access";
import { AuthenticationRequiredError, requireMerchant } from "@/lib/auth/session";

export const runtime = "nodejs";

const MAX_REQUEST_CHARS = 65_536;
const requestSchema = z.object({
  caseId: z.uuid().optional(),
  messages: z.array(z.unknown()).min(1).max(40),
});
const userMessageSchema = z.object({
  id: z.string().min(1).max(128),
  role: z.literal("user"),
  parts: z.array(z.object({
    type: z.literal("text"),
    text: z.string().max(4_000),
  })).min(1).max(5),
});

/** Client-supplied assistant and tool history cannot establish case facts or approval. */
function latestMerchantMessage(messages: unknown[]): UIMessage {
  const last = userMessageSchema.parse(messages.at(-1));
  const text = z.string().trim().min(1).max(4_000).parse(
    last.parts.map((part) => part.text.trim()).filter(Boolean).join("\n"),
  );
  return { id: last.id, role: "user", parts: [{ type: "text", text }] };
}

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    if (rawBody.length > MAX_REQUEST_CHARS) {
      return NextResponse.json({ error: "Message is too large" }, { status: 413 });
    }
    const input = requestSchema.parse(JSON.parse(rawBody) as unknown);
    const merchantMessage = latestMerchantMessage(input.messages);

    const { supabase, userId } = await requireMerchant();
    if (input.caseId) await assertCaseOwnership(supabase, input.caseId, userId);

    const agent = createClaimBackAgent({ caseId: input.caseId ?? null, userId });
    return await createAgentUIStreamResponse({
      agent,
      uiMessages: [merchantMessage],
      abortSignal: request.signal,
      sendReasoning: false,
      headers: { "Cache-Control": "no-store" },
      onError: () => "ClaimBack could not complete this step. Please try again.",
    });
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) {
      return NextResponse.json({ error: "Sign in required" }, { status: 401 });
    }
    if (error instanceof CaseAccessError) {
      return NextResponse.json({ error: "Case not found" }, { status: 404 });
    }
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return NextResponse.json({ error: "Invalid agent request" }, { status: 400 });
    }
    if (error instanceof ModelConfigurationError) {
      return NextResponse.json({ error: "AI is not configured yet" }, { status: 503 });
    }
    return NextResponse.json({ error: "Agent request failed" }, { status: 500 });
  }
}
