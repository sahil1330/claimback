import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ requireMerchant: vi.fn(), transcribeAudio: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", () => ({
  requireMerchant: mocks.requireMerchant,
  AuthenticationRequiredError: class AuthenticationRequiredError extends Error {},
}));
vi.mock("@/lib/voice/sarvam", async () => ({
  ...await import("../../../../lib/voice/sarvam"),
  transcribeAudio: mocks.transcribeAudio,
}));

import { AuthenticationRequiredError } from "@/lib/auth/session";
import { POST } from "./route";

function request(file?: File) {
  const form = new FormData();
  if (file) form.set("file", file);
  return new NextRequest("http://localhost/api/voice/transcribe", { method: "POST", body: form });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireMerchant.mockResolvedValue({ userId: "merchant" });
  mocks.transcribeAudio.mockResolvedValue({ transcript: "48 boxes aaye", languageCode: "hi-IN", source: "sarvam" });
});

describe("POST /api/voice/transcribe", () => {
  it("does not parse or forward audio for an unsigned-in merchant", async () => {
    mocks.requireMerchant.mockRejectedValueOnce(new AuthenticationRequiredError());
    const response = await POST(request(new File(["audio"], "clip.webm", { type: "audio/webm" })));

    expect(response.status).toBe(401);
    expect((await response.json()).fallback).toBe("text");
    expect(mocks.transcribeAudio).not.toHaveBeenCalled();
  });

  it("returns a transcript for valid browser audio", async () => {
    const response = await POST(request(new File(["audio"], "clip.webm", { type: "audio/webm" })));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ transcript: "48 boxes aaye", languageCode: "hi-IN", source: "sarvam" });
    expect(mocks.transcribeAudio).toHaveBeenCalledOnce();
  });

  it("signals typed fallback for missing or unsupported audio", async () => {
    const missing = await POST(request());
    expect(missing.status).toBe(400);
    expect(await missing.json()).toMatchObject({ code: "VOICE_INVALID_AUDIO", fallback: "text", retryable: false });

    const unsupported = await POST(request(new File(["x"], "note.txt", { type: "text/plain" })));
    expect(unsupported.status).toBe(400);
    expect(mocks.transcribeAudio).not.toHaveBeenCalled();
  });

  it("keeps typed input available on provider failure", async () => {
    mocks.transcribeAudio.mockRejectedValueOnce(new Error("network is down"));
    const response = await POST(request(new File(["audio"], "clip.webm", { type: "audio/webm" })));

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ code: "VOICE_UNAVAILABLE", fallback: "text", retryable: true });
  });

  it("does not forward cross-origin audio", async () => {
    const crossOrigin = request(new File(["audio"], "clip.webm", { type: "audio/webm" }));
    crossOrigin.headers.set("origin", "https://other.example");
    const response = await POST(crossOrigin);
    expect(response.status).toBe(403);
    expect(mocks.requireMerchant).not.toHaveBeenCalled();
    expect(mocks.transcribeAudio).not.toHaveBeenCalled();
  });
});
