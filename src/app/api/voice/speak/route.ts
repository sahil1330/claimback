import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AuthenticationRequiredError, requireMerchant } from "@/lib/auth/session";
import { speechRequestSchema, synthesizeSpeech, VoiceServiceError } from "@/lib/voice/sarvam";

export const runtime = "nodejs";

const MAX_REQUEST_BYTES = 8_192;

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return NextResponse.json(
      { error: "Voice request denied", code: "VOICE_UNAVAILABLE", fallback: "text", retryable: false },
      { status: 403 },
    );
  }
  try {
    await requireMerchant();
    const body = await request.text();
    if (body.length > MAX_REQUEST_BYTES) {
      return NextResponse.json({ error: "Speech request is too large", code: "INVALID_REQUEST", fallback: "text", retryable: false }, { status: 413 });
    }
    const input = speechRequestSchema.parse(JSON.parse(body) as unknown);
    const result = await synthesizeSpeech(input, request.signal);
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) {
      return NextResponse.json({ error: "Sign in required", code: "AUTH_REQUIRED", fallback: "text", retryable: false }, { status: 401 });
    }
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return NextResponse.json({ error: "Invalid speech request", code: "INVALID_REQUEST", fallback: "text", retryable: false }, { status: 400 });
    }
    if (error instanceof VoiceServiceError) {
      const status = error.code === "VOICE_RATE_LIMITED" ? 429 : 503;
      return NextResponse.json(
        { error: error.message, code: error.code, fallback: "text", retryable: error.retryable },
        { status, headers: { "Cache-Control": "no-store" } },
      );
    }
    return NextResponse.json({ error: "Voice is temporarily unavailable", code: "VOICE_UNAVAILABLE", fallback: "text", retryable: true }, { status: 503 });
  }
}
