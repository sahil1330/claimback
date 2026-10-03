import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ requireMerchant: vi.fn(), synthesizeSpeech: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", () => ({
  requireMerchant: mocks.requireMerchant,
  AuthenticationRequiredError: class AuthenticationRequiredError extends Error {},
}));
vi.mock("@/lib/voice/sarvam", async () => ({
  ...await import("../../../../lib/voice/sarvam"),
  synthesizeSpeech: mocks.synthesizeSpeech,
}));

import { AuthenticationRequiredError } from "@/lib/auth/session";
import { POST } from "./route";

function request(body: unknown) {
  return new NextRequest("http://localhost/api/voice/speak", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireMerchant.mockResolvedValue({ userId: "merchant" });
  mocks.synthesizeSpeech.mockResolvedValue({ audioBase64: "UklGRg==", mimeType: "audio/wav", source: "sarvam" });
});

describe("POST /api/voice/speak", () => {
  it("requires sign-in before requesting speech", async () => {
    mocks.requireMerchant.mockRejectedValueOnce(new AuthenticationRequiredError());
    const response = await POST(request({ text: "Hello" }));
    expect(response.status).toBe(401);
    expect(mocks.synthesizeSpeech).not.toHaveBeenCalled();
  });

  it("returns playable audio data for a bounded request", async () => {
    const response = await POST(request({ text: "Hello", languageCode: "en-IN" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ audioBase64: "UklGRg==", mimeType: "audio/wav", source: "sarvam" });
    expect(mocks.synthesizeSpeech).toHaveBeenCalledWith({ text: "Hello", languageCode: "en-IN" }, expect.any(AbortSignal));
  });

  it("rejects unsupported language and preserves typed fallback", async () => {
    const response = await POST(request({ text: "Hello", languageCode: "xx-XX" }));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "INVALID_REQUEST", fallback: "text", retryable: false });
    expect(mocks.synthesizeSpeech).not.toHaveBeenCalled();
  });

  it("does not forward cross-origin speech requests", async () => {
    const crossOrigin = request({ text: "Hello" });
    crossOrigin.headers.set("origin", "https://other.example");
    const response = await POST(crossOrigin);
    expect(response.status).toBe(403);
    expect(mocks.requireMerchant).not.toHaveBeenCalled();
    expect(mocks.synthesizeSpeech).not.toHaveBeenCalled();
  });
});
