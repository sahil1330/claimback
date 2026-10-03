import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireMerchant: vi.fn(),
  assertCaseOwnership: vi.fn(),
  createAdminClient: vi.fn(),
  appendCaseEvent: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("../auth/session", () => ({ requireMerchant: mocks.requireMerchant }));
vi.mock("../auth/case-access", () => ({
  assertCaseOwnership: mocks.assertCaseOwnership,
  CaseAccessError: class CaseAccessError extends Error {},
}));
vi.mock("../supabase/admin", () => ({ createAdminClient: mocks.createAdminClient }));
vi.mock("../cases/events", () => ({ appendCaseEvent: mocks.appendCaseEvent }));

import { approveClaim, createDraftClaim, draftClaimFromPersistedCase, sendSupplierMessage } from "./operations";

const caseId = "5d5dc89e-aeeb-4afe-9b2e-dde126e7cece";
const userId = "03394e16-c236-4ad1-99fb-38259e8238ad";
const source = (sourceArtifactId: string, sourceLabel: string) => ({
  sourceArtifactId, sourceLabel, excerpt: "Documented line", locator: "line 1",
});
const discrepancy = {
  id: "0:SKU:SHORT_DELIVERY",
  type: "SHORT_DELIVERY",
  skuRef: "SKU",
  description: "2 units were billed but did not arrive",
  affectedQuantity: 2,
  expectedUnitPricePaise: 10000,
  billedUnitPricePaise: 10000,
  amountPaise: 20000,
  calculation: { kind: "short_delivery", inputs: { missingQuantity: 2, billedUnitPricePaise: 10000 } },
  promisedEvidence: source("f4cc15b4-8614-45ef-ab6b-ad7fb85beea3", "Supplier agreement"),
  billedEvidence: source("a395d119-3b6a-42b9-9566-311fd2d6a9c0", "Invoice INV-3812"),
  receivedEvidence: source("74cf1e2f-58fd-486c-98f3-02db5b0030bb", "Merchant receiving confirmation"),
  confidence: "high", status: "supported",
};

type MutableCase = {
  id: string; user_id: string; status: string; discrepancies: unknown;
  potential_recovery_paise: number; merchant_approved_at: string | null;
  claim_sent_at: string | null;
};

function caseRow(overrides: Partial<MutableCase> = {}): MutableCase {
  return {
    id: caseId, user_id: userId, status: "AWAITING_MERCHANT_APPROVAL",
    discrepancies: [discrepancy], potential_recovery_paise: 20000,
    merchant_approved_at: "2026-10-03T08:00:00.000Z", claim_sent_at: null,
    ...overrides,
  };
}

function fakeAdmin(row: MutableCase) {
  const messages = new Set<string>();
  const messageInserts = vi.fn((message: { id: string }) => {
    if (messages.has(message.id)) return Promise.resolve({ error: { code: "23505" } });
    messages.add(message.id);
    return Promise.resolve({ error: null });
  });
  const admin = {
    from(table: string) {
      if (table === "supplier_messages") {
        return {
          select() { return this; }, eq() { return this; },
          maybeSingle: async () => ({ data: messages.has(caseId) ? { id: caseId } : null, error: null }),
          insert: messageInserts,
        };
      }
      if (table !== "cases") throw new Error(`Unexpected table: ${table}`);
      const filters: Array<[string, unknown]> = [];
      let patch: Partial<MutableCase> | null = null;
      const query = {
        select() { return this; },
        eq(key: string, value: unknown) { filters.push([key, value]); return this; },
        is(key: string, value: unknown) { filters.push([key, value]); return this; },
        not() { return this; },
        update(value: Partial<MutableCase>) { patch = value; return this; },
        async maybeSingle() {
          const matches = filters.every(([key, value]) => row[key as keyof MutableCase] === value);
          if (!matches) return { data: null, error: null };
          if (patch) Object.assign(row, patch);
          return { data: { ...row }, error: null };
        },
      };
      return query;
    },
  };
  return { admin, messageInserts, messages };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireMerchant.mockResolvedValue({ supabase: {}, userId });
  mocks.assertCaseOwnership.mockResolvedValue({ id: caseId, user_id: userId });
  mocks.appendCaseEvent.mockResolvedValue(undefined);
});

describe("claim approval guard and demo send", () => {
  it("T6 rejects a send before recording merchant approval", async () => {
    const db = fakeAdmin(caseRow({ merchant_approved_at: null }));
    mocks.createAdminClient.mockReturnValue(db.admin);
    await expect(sendSupplierMessage(caseId)).rejects.toMatchObject({ code: "NOT_APPROVED" });
    expect(db.messageInserts).not.toHaveBeenCalled();
    expect(mocks.assertCaseOwnership).toHaveBeenCalledWith({}, caseId, userId);
  });

  it("does not use the admin client when ownership fails", async () => {
    mocks.assertCaseOwnership.mockRejectedValueOnce(new Error("Access denied"));
    await expect(sendSupplierMessage(caseId)).rejects.toThrow("Access denied");
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it("sends once and treats a second request as already sent", async () => {
    const row = caseRow();
    const db = fakeAdmin(row);
    mocks.createAdminClient.mockReturnValue(db.admin);
    const first = await sendSupplierMessage(caseId);
    const second = await sendSupplierMessage(caseId);
    expect(first.status).toBe("sent");
    expect(second.status).toBe("already_sent");
    expect(row.status).toBe("CLAIM_SENT");
    expect(db.messageInserts).toHaveBeenCalledTimes(1);
    expect(mocks.appendCaseEvent).toHaveBeenCalledTimes(1);
  });

  it("records merchant approval before a claim can be sent", async () => {
    const row = caseRow({ merchant_approved_at: null });
    const db = fakeAdmin(row);
    mocks.createAdminClient.mockReturnValue(db.admin);
    await expect(sendSupplierMessage(caseId)).rejects.toMatchObject({ code: "NOT_APPROVED" });
    const approval = await approveClaim(caseId);
    expect(approval.status).toBe("approved");
    expect(row.merchant_approved_at).toEqual(approval.merchantApprovedAt);
    expect((await sendSupplierMessage(caseId)).status).toBe("sent");
    expect(db.messageInserts).toHaveBeenCalledTimes(1);
  });

  it("builds a draft from persisted evidence and rejects mismatched money", () => {
    const draft = draftClaimFromPersistedCase(caseRow());
    expect(draft.body).toContain("₹200.00");
    expect(draft.evidence).toHaveLength(3);
    expect(() => draftClaimFromPersistedCase(caseRow({ potential_recovery_paise: 30000 })))
      .toThrow("do not match");
  });

  it("does not manufacture a claim for a clean case", async () => {
    const db = fakeAdmin(caseRow({ status: "NO_DISCREPANCY", discrepancies: [], potential_recovery_paise: 0 }));
    mocks.createAdminClient.mockReturnValue(db.admin);
    await expect(createDraftClaim(caseId)).rejects.toThrow("clean delivery");
    expect(mocks.appendCaseEvent).not.toHaveBeenCalled();
  });
});
