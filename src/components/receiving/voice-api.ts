import { z } from "zod";

export const MAX_RECEIVING_AUDIO_BYTES = 8 * 1024 * 1024;

const transcriptionSchema = z.object({
  transcript: z.string().trim().min(1).max(10_000),
  languageCode: z.string().nullable(),
  source: z.literal("sarvam"),
});

const errorSchema = z.object({
  error: z.string().min(1),
  fallback: z.literal("text"),
});

export async function transcribeReceivingAudio(file: File, signal?: AbortSignal) {
  if (file.size === 0) throw new Error("The recording is empty. Record again or type your note.");
  if (file.size > MAX_RECEIVING_AUDIO_BYTES) throw new Error("The recording is over 8 MB. Record a shorter note or type it.");

  const form = new FormData();
  form.set("file", file);
  const response = await fetch("/api/voice/transcribe", {
    method: "POST",
    body: form,
    signal,
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const failure = errorSchema.safeParse(body);
    throw new Error(failure.success ? failure.data.error : "Voice is unavailable right now.");
  }
  const parsed = transcriptionSchema.safeParse(body);
  if (!parsed.success) throw new Error("The transcript could not be read. Try again or type your note.");
  return parsed.data;
}
