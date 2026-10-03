import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ resetDemoForCurrentMerchant: vi.fn() }));
vi.mock("@/lib/demo/reset", () => ({
  resetDemoForCurrentMerchant: mocks.resetDemoForCurrentMerchant,
  DemoResetError: class DemoResetError extends Error {},
}));
vi.mock("@/lib/auth/session", () => ({ AuthenticationRequiredError: class AuthenticationRequiredError extends Error {} }));

import { POST } from "./route";

describe("demo reset confirmation", () => {
  beforeEach(() => {
    vi.stubEnv("DEMO_MODE", "true");
    mocks.resetDemoForCurrentMerchant.mockResolvedValue({ syntheticDemoHistory: true });
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("requires an exact confirmation to delete merchant-created cases", async () => {
    const normal = await POST(new NextRequest("http://localhost/api/demo/reset", { method: "POST" }));
    expect(normal.status).toBe(200);
    expect(mocks.resetDemoForCurrentMerchant).toHaveBeenLastCalledWith({ allowActiveCaseDeletion: false });

    const invalid = await POST(new NextRequest("http://localhost/api/demo/reset", {
      method: "POST", body: JSON.stringify({ confirmation: "yes" }),
    }));
    expect(invalid.status).toBe(400);
    expect(mocks.resetDemoForCurrentMerchant).toHaveBeenCalledTimes(1);

    const confirmed = await POST(new NextRequest("http://localhost/api/demo/reset", {
      method: "POST", body: JSON.stringify({ confirmation: "RESET_ALL_DEMO_CASES" }),
    }));
    expect(confirmed.status).toBe(200);
    expect(mocks.resetDemoForCurrentMerchant).toHaveBeenLastCalledWith({ allowActiveCaseDeletion: true });
  });
});
