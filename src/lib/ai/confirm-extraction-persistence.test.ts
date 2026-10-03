import { beforeEach, describe, expect, it, vi } from "vitest";
import { normalizeInvoiceOutput } from "./normalize";

const mocks = vi.hoisted(() => ({
  requireMerchant: vi.fn(),
  assertCaseOwnership: vi.fn(),
  createAdminClient: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("../auth/session", () => ({ requireMerchant: mocks.requireMerchant }));
vi.mock("../auth/case-access", () => ({ assertCaseOwnership: mocks.assertCaseOwnership }));
vi.mock("../supabase/admin", () => ({ createAdminClient: mocks.createAdminClient }));

import { confirmEvidenceExtraction } from "./confirm-extraction-persistence";

const caseId = "7a10cd19-c42d-4ff3-865a-ac04aeb8cfa3";
const artifactId = "d26b22b5-4d57-48be-a121-dd211143800c";
const userId = "753adf5b-d44f-42f8-9ad7-8a0924a973a5";

const original = normalizeInvoiceOutput({
  invoiceNumber: "INV-3812", supplierName: "City Distributor",
  evidence: { excerpt: "INV-3812 City Distributor", locator: "header" },
  lines: [{
    rawName: "Maggi 70g", skuRef: "MG-70", unit: "box", packSize: "70g",
    quantity: 20, unitPriceText: null, discountText: null, confidence: "low",
    evidence: { excerpt: "Maggi 70g 20 units", locator: "page 1 row 2" },
    uncertainties: [{ field: "unitPriceText", reason: "Digit obscured" }],
  }],
  uncertainties: [],
}, { artifactId, label: "invoice.txt" });
if (original.status !== "needs_confirmation") throw new Error("Fixture must be uncertain");

const caseQuery = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn() };
const artifactQuery = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn() };
const updateQuery = {
  update: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
  select: vi.fn().mockReturnThis(), maybeSingle: vi.fn(),
};
const eventQuery = { insert: vi.fn() };
const supabase = { from: vi.fn((name: string) => name === "cases" ? caseQuery : artifactQuery) };
const admin = { from: vi.fn((name: string) => name === "artifacts" ? updateQuery : eventQuery) };
const input = {
  caseId, artifactId,
  acknowledgments: original.confirmations.map(({ field, reason }) => ({ field, reason })),
  corrections: { "lines.0.unitPricePaise": 44100 },
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireMerchant.mockResolvedValue({ supabase, userId });
  mocks.assertCaseOwnership.mockResolvedValue({ id: caseId, user_id: userId });
  mocks.createAdminClient.mockReturnValue(admin);
  caseQuery.maybeSingle.mockResolvedValue({ data: { status: "DRAFT" }, error: null });
  artifactQuery.maybeSingle.mockResolvedValue({ data: {
    type: "invoice", extraction_status: "needs_confirmation", extracted: original,
  }, error: null });
  updateQuery.maybeSingle.mockResolvedValue({ data: { id: artifactId }, error: null });
  eventQuery.insert.mockResolvedValue({ error: null });
});

describe("confirmation persistence boundary", () => {
  it("verifies ownership and case state before an admin write, then records a scoped audit", async () => {
    const result = await confirmEvidenceExtraction(input);
    expect(result.status).toBe("ready");
    expect(mocks.assertCaseOwnership).toHaveBeenCalledWith(supabase, caseId, userId);
    expect(updateQuery.eq).toHaveBeenCalledWith("id", artifactId);
    expect(updateQuery.eq).toHaveBeenCalledWith("case_id", caseId);
    expect(updateQuery.eq).toHaveBeenCalledWith("user_id", userId);
    expect(updateQuery.eq).toHaveBeenCalledWith("type", "invoice");
    expect(updateQuery.eq).toHaveBeenCalledWith("extraction_status", "needs_confirmation");
    expect(updateQuery.eq).toHaveBeenCalledWith("extracted", JSON.stringify(original));
    expect(updateQuery.update).toHaveBeenCalledWith(expect.objectContaining({ extraction_status: "complete" }));
    expect(eventQuery.insert).toHaveBeenCalledWith(expect.objectContaining({
      case_id: caseId, user_id: userId, event_type: "evidence_merchant_confirmed",
      payload: expect.objectContaining({ details: expect.objectContaining({ artifactId, actorId: userId }) }),
    }));
  });

  it("does not obtain an admin client when ownership fails", async () => {
    mocks.assertCaseOwnership.mockRejectedValueOnce(new Error("Access denied"));
    await expect(confirmEvidenceExtraction(input)).rejects.toThrow("Access denied");
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it("rejects the wrong case state, artifact type and stale extraction before mutation", async () => {
    caseQuery.maybeSingle.mockResolvedValueOnce({ data: { status: "RESOLVED" }, error: null });
    await expect(confirmEvidenceExtraction(input)).rejects.toThrow(/after reconciliation/);
    artifactQuery.maybeSingle.mockResolvedValueOnce({ data: {
      type: "credit_note", extraction_status: "needs_confirmation", extracted: original,
    }, error: null });
    await expect(confirmEvidenceExtraction(input)).rejects.toThrow(/invoice or agreement/);
    updateQuery.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    await expect(confirmEvidenceExtraction(input)).rejects.toThrow(/changed while you reviewed/);
    expect(eventQuery.insert).not.toHaveBeenCalled();
  });
});
