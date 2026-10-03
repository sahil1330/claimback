import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireMerchant: vi.fn(),
  createAdminClient: vi.fn(),
  buildDemoResetPlan: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("../auth/session", () => ({ requireMerchant: mocks.requireMerchant }));
vi.mock("../supabase/admin", () => ({ createAdminClient: mocks.createAdminClient }));
vi.mock("./reset-fixtures", () => ({ buildDemoResetPlan: mocks.buildDemoResetPlan }));

import { DemoResetError, resetDemoForCurrentMerchant } from "./reset";

describe("demo reset guard", () => {
  beforeEach(() => {
    vi.stubEnv("DEMO_MODE", "true");
    vi.stubEnv("DEMO_USER_EMAIL", "demo@example.com");
    mocks.requireMerchant.mockResolvedValue({
      userId: "11111111-1111-4111-8111-111111111111",
      supabase: { auth: { getUser: vi.fn().mockResolvedValue({ data: { user: {
        id: "11111111-1111-4111-8111-111111111111", email: "demo@example.com",
      } }, error: null }) } },
    });
    mocks.buildDemoResetPlan.mockReturnValue({ cases: [{ id: "seed-case" }] });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("refuses to mutate storage or database when a merchant-created case exists", async () => {
    const deleteCases = vi.fn();
    const upload = vi.fn();
    const from = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue({
          data: [{ id: "seed-case" }, { id: "merchant-case" }], error: null,
        }) }),
      }),
      delete: deleteCases,
    });
    mocks.createAdminClient.mockReturnValue({ from, storage: { from: vi.fn().mockReturnValue({ upload }) } });

    await expect(resetDemoForCurrentMerchant()).rejects.toThrow(new DemoResetError(
      "Active delivery cases exist. Confirm deleting them before resetting the demo.",
    ));
    expect(from).toHaveBeenCalledTimes(1);
    expect(from).toHaveBeenCalledWith("cases");
    expect(deleteCases).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
  });
});
