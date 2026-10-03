import { NextRequest, NextResponse } from "next/server";
import { AuthenticationRequiredError, requireMerchant } from "@/lib/auth/session";
import { MAX_AUDIO_BYTES, transcribeAudio, validateAudioFile, VoiceServiceError } from "@/lib/voice/sarvam";

export const runtime = "nodejs";

function failure(error: VoiceServiceError, status: number) {
  return NextResponse.json(
    { error: error.message, code: error.code, fallback: "text", retryable: error.retryable },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return failure(new VoiceServiceError("VOICE_UNAVAILABLE", "Voice request denied", false), 403);
  }
  try {
    await requireMerchant();
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) {
      return NextResponse.json({ error: "Sign in required", code: "AUTH_REQUIRED", fallback: "text", retryable: false }, { status: 401 });
    }
    return failure(new VoiceServiceError("VOICE_UNAVAILABLE", "Voice is temporarily unavailable", true), 503);
  }

  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_AUDIO_BYTES + 32_768) {
    return failure(new VoiceServiceError("VOICE_INVALID_AUDIO", "Audio is too large; use a shorter recording", false), 413);
  }

  try {
    const form = await request.formData();
    const file = validateAudioFile(form.get("file"));
    const result = await transcribeAudio(file, request.signal);
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof VoiceServiceError) {
      const status = error.code === "VOICE_INVALID_AUDIO" ? 400
        : error.code === "VOICE_NOT_CONFIGURED" ? 503
          : error.code === "VOICE_RATE_LIMITED" ? 429 : 503;
      return failure(error, status);
    }
    if (error instanceof TypeError || error instanceof SyntaxError) {
      return failure(new VoiceServiceError("VOICE_INVALID_AUDIO", "Invalid audio upload", false), 400);
    }
    return failure(new VoiceServiceError("VOICE_UNAVAILABLE", "Voice is temporarily unavailable", true), 503);
  }
}
