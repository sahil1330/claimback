import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { speechRequestSchema, synthesizeSpeech, transcribeAudio, validateAudioFile, VoiceServiceError } from "./sarvam";

const wavBase64 = "UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=";

function audioFile(content = "short recorded clip", type = "audio/webm") {
  return new File([content], "recording.webm", { type });
}

beforeEach(() => vi.stubEnv("SARVAM_API_KEY", "test-secret"));
afterEach(() => vi.unstubAllEnvs());

describe("Sarvam voice provider", () => {
  it("sends Saaras v4 multipart audio and returns only the validated transcript", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      request_id: "provider-request",
      transcript: "  दो डिब्बे कम आए  ",
      language_code: "hi-IN",
    }), { status: 200 }));

    const result = await transcribeAudio(audioFile(), undefined, fetcher);

    expect(result).toEqual({ transcript: "दो डिब्बे कम आए", languageCode: "hi-IN", source: "sarvam" });
    expect(fetcher).toHaveBeenCalledWith("https://api.sarvam.ai/speech-to-text", expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({ "api-subscription-key": "test-secret" }),
    }));
    const options = fetcher.mock.calls[0][1];
    expect(options?.body).toBeInstanceOf(FormData);
    const form = options?.body as FormData;
    expect(form.get("model")).toBe("saaras:v4");
    expect(form.get("mode")).toBe("transcribe");
    expect(form.get("file")).toBeInstanceOf(File);
    expect((options?.headers as Record<string, string>)["Content-Type"]).toBeUndefined();
  });

  it("sends Bulbul v3 JSON and validates base64 WAV output", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ audios: [wavBase64] }), { status: 200 }));

    const result = await synthesizeSpeech({ text: "  कृपया पुष्टि करें  " }, undefined, fetcher);

    expect(result).toEqual({ audioBase64: wavBase64, mimeType: "audio/wav", source: "sarvam" });
    const options = fetcher.mock.calls[0][1];
    expect(JSON.parse(options?.body as string)).toEqual({
      text: "कृपया पुष्टि करें",
      language_code: "hi-IN",
      model: "bulbul:v3",
      output_audio_codec: "wav",
    });
    expect((options?.headers as Record<string, string>)["api-subscription-key"]).toBe("test-secret");
  });

  it("does not call the provider when credentials are absent", async () => {
    vi.stubEnv("SARVAM_API_KEY", "");
    const fetcher = vi.fn<typeof fetch>();

    await expect(transcribeAudio(audioFile(), undefined, fetcher))
      .rejects.toMatchObject({ code: "VOICE_NOT_CONFIGURED", retryable: false });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("treats provider errors and malformed responses as recoverable", async () => {
    const throttled = vi.fn<typeof fetch>().mockResolvedValue(new Response("retry later", { status: 429 }));
    await expect(transcribeAudio(audioFile(), undefined, throttled))
      .rejects.toMatchObject({ code: "VOICE_RATE_LIMITED", retryable: true });

    const malformed = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ transcript: "" }), { status: 200 }));
    await expect(transcribeAudio(audioFile(), undefined, malformed))
      .rejects.toMatchObject({ code: "VOICE_INVALID_RESPONSE", retryable: true });

    const invalidAudio = vi.fn<typeof fetch>().mockResolvedValue(new Response("bad audio", { status: 422 }));
    await expect(transcribeAudio(audioFile(), undefined, invalidAudio))
      .rejects.toMatchObject({ code: "VOICE_INVALID_AUDIO", retryable: false });
  });

  it("rejects unsupported or empty audio and overlong speech locally", () => {
    expect(() => validateAudioFile(new File(["x"], "note.txt", { type: "text/plain" })))
      .toThrow(VoiceServiceError);
    expect(() => validateAudioFile(audioFile(""))).toThrow(VoiceServiceError);
    expect(speechRequestSchema.safeParse({ text: "x".repeat(1_501) }).success).toBe(false);
  });
});
