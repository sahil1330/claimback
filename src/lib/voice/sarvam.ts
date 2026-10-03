import "server-only";

import { z } from "zod";

const SARVAM_BASE_URL = "https://api.sarvam.ai";
const PROVIDER_TIMEOUT_MS = 20_000;

export const MAX_AUDIO_BYTES = 8 * 1024 * 1024;
export const MAX_SPEECH_TEXT_CHARS = 1_500;

const ttsLanguages = [
  "en-IN", "hi-IN", "bn-IN", "ta-IN", "te-IN", "kn-IN",
  "ml-IN", "mr-IN", "gu-IN", "pa-IN", "od-IN",
] as const;

export const speechRequestSchema = z.object({
  text: z.string().trim().min(1).max(MAX_SPEECH_TEXT_CHARS),
  languageCode: z.enum(ttsLanguages).default("hi-IN"),
});

const transcriptionResponseSchema = z.object({
  transcript: z.string().trim().min(1).max(10_000),
  language_code: z.string().nullable().optional(),
});

const speechResponseSchema = z.object({
  audios: z.array(z.base64().min(1).max(12_000_000)).length(1),
});

const supportedAudioTypes = new Set([
  "audio/webm", "audio/wav", "audio/x-wav", "audio/wave",
  "audio/mpeg", "audio/mp3", "audio/mp4", "audio/x-m4a",
  "audio/ogg", "audio/aac", "audio/flac", "audio/x-flac",
]);

export type VoiceErrorCode =
  | "VOICE_NOT_CONFIGURED"
  | "VOICE_UNAVAILABLE"
  | "VOICE_RATE_LIMITED"
  | "VOICE_INVALID_AUDIO"
  | "VOICE_INVALID_RESPONSE";

export class VoiceServiceError extends Error {
  constructor(
    public readonly code: VoiceErrorCode,
    message: string,
    public readonly retryable: boolean,
  ) {
    super(message);
    this.name = "VoiceServiceError";
  }
}

export function validateAudioFile(value: FormDataEntryValue | null): File {
  if (!(value instanceof File) || value.size === 0) {
    throw new VoiceServiceError("VOICE_INVALID_AUDIO", "Record a short audio clip and try again", false);
  }
  if (value.size > MAX_AUDIO_BYTES) {
    throw new VoiceServiceError("VOICE_INVALID_AUDIO", "Audio is too large; use a shorter recording", false);
  }
  const mimeType = value.type.toLowerCase().split(";", 1)[0];
  if (!supportedAudioTypes.has(mimeType)) {
    throw new VoiceServiceError("VOICE_INVALID_AUDIO", "This audio format is not supported", false);
  }
  return value;
}

function subscriptionKey(): string {
  const key = process.env.SARVAM_API_KEY?.trim();
  if (!key) {
    throw new VoiceServiceError("VOICE_NOT_CONFIGURED", "Voice is not available yet", false);
  }
  return key;
}

function providerSignal(requestSignal?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(PROVIDER_TIMEOUT_MS);
  return requestSignal ? AbortSignal.any([timeout, requestSignal]) : timeout;
}

async function providerJson(response: Response): Promise<unknown> {
  if (!response.ok) {
    if (response.status === 429) {
      throw new VoiceServiceError("VOICE_RATE_LIMITED", "Voice is busy; try again shortly", true);
    }
    if (response.status === 400 || response.status === 422) {
      throw new VoiceServiceError("VOICE_INVALID_AUDIO", "Voice could not process this input", false);
    }
    throw new VoiceServiceError("VOICE_UNAVAILABLE", "Voice is temporarily unavailable", true);
  }
  try {
    return await response.json() as unknown;
  } catch {
    throw new VoiceServiceError("VOICE_INVALID_RESPONSE", "Voice returned an unreadable result", true);
  }
}

async function callProvider(
  path: string,
  body: BodyInit,
  contentType: string | null,
  requestSignal?: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<unknown> {
  const headers: Record<string, string> = {
    "api-subscription-key": subscriptionKey(),
    Accept: "application/json",
  };
  if (contentType) headers["Content-Type"] = contentType;

  try {
    const response = await fetcher(`${SARVAM_BASE_URL}${path}`, {
      method: "POST",
      headers,
      body,
      signal: providerSignal(requestSignal),
      cache: "no-store",
    });
    return await providerJson(response);
  } catch (error) {
    if (error instanceof VoiceServiceError) throw error;
    throw new VoiceServiceError("VOICE_UNAVAILABLE", "Voice is temporarily unavailable", true);
  }
}

export async function transcribeAudio(
  file: File,
  requestSignal?: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<{ transcript: string; languageCode: string | null; source: "sarvam" }> {
  const audio = validateAudioFile(file);
  const form = new FormData();
  form.set("file", audio, audio.name || "recording");
  form.set("model", "saaras:v4");
  form.set("mode", "transcribe");
  const raw = await callProvider("/speech-to-text", form, null, requestSignal, fetcher);
  const parsed = transcriptionResponseSchema.safeParse(raw);
  if (!parsed.success) {
    throw new VoiceServiceError("VOICE_INVALID_RESPONSE", "Voice returned an unreadable transcript", true);
  }
  return {
    transcript: parsed.data.transcript,
    languageCode: parsed.data.language_code ?? null,
    source: "sarvam",
  };
}

export async function synthesizeSpeech(
  input: z.input<typeof speechRequestSchema>,
  requestSignal?: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<{ audioBase64: string; mimeType: "audio/wav"; source: "sarvam" }> {
  const validated = speechRequestSchema.parse(input);
  const raw = await callProvider(
    "/text-to-speech",
    JSON.stringify({
      text: validated.text,
      language_code: validated.languageCode,
      model: "bulbul:v3",
      output_audio_codec: "wav",
    }),
    "application/json",
    requestSignal,
    fetcher,
  );
  const parsed = speechResponseSchema.safeParse(raw);
  if (!parsed.success) {
    throw new VoiceServiceError("VOICE_INVALID_RESPONSE", "Voice returned unreadable audio", true);
  }
  return { audioBase64: parsed.data.audios[0], mimeType: "audio/wav", source: "sarvam" };
}
