import { afterEach, describe, expect, it, vi } from "vitest";
import { transcribeReceivingAudio } from "./voice-api";

afterEach(() => vi.unstubAllGlobals());

describe("receiving voice fallback", () => {
  const audio = new File(["short clip"], "note.webm", { type: "audio/webm" });

  it("returns only a reviewable transcript after transcription", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ transcript: "48 boxes arrived", languageCode: "en-IN", source: "sarvam" }), { status: 200 }));
    vi.stubGlobal("fetch", fetcher);
    await expect(transcribeReceivingAudio(audio)).resolves.toEqual({ transcript: "48 boxes arrived", languageCode: "en-IN", source: "sarvam" });
    expect(fetcher).toHaveBeenCalledWith("/api/voice/transcribe", expect.objectContaining({ method: "POST", body: expect.any(FormData) }));
  });

  it("surfaces the server's typed fallback message", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "Voice is temporarily unavailable", fallback: "text", retryable: true }), { status: 503 })));
    await expect(transcribeReceivingAudio(audio)).rejects.toThrow("Voice is temporarily unavailable");
  });

  it("uses a friendly typed fallback when the server returns unreadable JSON", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("Unavailable", { status: 503 })));
    await expect(transcribeReceivingAudio(audio)).rejects.toThrow("Voice is unavailable right now.");
  });

  it("rejects oversized audio before contacting the route", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const largeFile = new File([new Uint8Array(8 * 1024 * 1024 + 1)], "large.webm", { type: "audio/webm" });
    await expect(transcribeReceivingAudio(largeFile)).rejects.toThrow("over 8 MB");
    expect(fetcher).not.toHaveBeenCalled();
  });
});
