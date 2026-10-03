import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireMerchant: vi.fn(),
  assertCaseOwnership: vi.fn(),
  createAdminClient: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("../auth/session", () => ({ requireMerchant: mocks.requireMerchant }));
vi.mock("../auth/case-access", () => ({ assertCaseOwnership: mocks.assertCaseOwnership }));
vi.mock("../supabase/admin", () => ({ createAdminClient: mocks.createAdminClient }));

import { persistExtractionResult } from "./extraction-persistence";

const caseId = "5d5dc89e-aeeb-4afe-9b2e-dde126e7cece";
const artifactId = "74cf1e2f-58fd-486c-98f3-02db5b0030bb";
const userId = "03394e16-c236-4ad1-99fb-38259e8238ad";
const query = {
  update: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  select: vi.fn().mockReturnThis(),
  maybeSingle: vi.fn(),
};
const admin = { from: vi.fn(() => query) };
const supabase = {};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireMerchant.mockResolvedValue({ supabase, userId });
  mocks.assertCaseOwnership.mockResolvedValue({ id: caseId, user_id: userId });
  mocks.createAdminClient.mockReturnValue(admin);
  query.maybeSingle.mockResolvedValue({ data: { id: artifactId }, error: null });
});

describe("extraction persistence", () => {
  it("rechecks ownership and filters the admin update by merchant, case and artifact", async () => {
    const result = { status: "ready" as const, facts: { invoiceNumber: "INV-3812" }, confirmations: [] as [] };
    await persistExtractionResult(caseId, artifactId, result);
    expect(mocks.assertCaseOwnership).toHaveBeenCalledWith(supabase, caseId, userId);
    expect(query.update).toHaveBeenCalledWith({ extracted: result, extraction_status: "complete" });
    expect(query.eq).toHaveBeenCalledWith("id", artifactId);
    expect(query.eq).toHaveBeenCalledWith("case_id", caseId);
    expect(query.eq).toHaveBeenCalledWith("user_id", userId);
  });

  it("never uses the admin client when merchant ownership fails", async () => {
    mocks.assertCaseOwnership.mockRejectedValueOnce(new Error("Access denied"));
    await expect(persistExtractionResult(caseId, artifactId, {
      status: "error", error: { code: "MODEL_FAILED", message: "Retry", recoverable: true },
    })).rejects.toThrow("Access denied");
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it("stores failed model work as failed without persisting invented facts", async () => {
    await persistExtractionResult(caseId, artifactId, {
      status: "error", error: { code: "MODEL_FAILED", message: "Retry", recoverable: true },
    });
    expect(query.update).toHaveBeenCalledWith({ extracted: null, extraction_status: "failed" });
  });
});
