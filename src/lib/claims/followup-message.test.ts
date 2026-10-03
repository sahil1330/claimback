import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireMerchant: vi.fn(), assertCaseOwnership: vi.fn(), createAdminClient: vi.fn(), appendCaseEvent: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("../auth/session", () => ({ requireMerchant: mocks.requireMerchant }));
vi.mock("../auth/case-access", () => ({ assertCaseOwnership: mocks.assertCaseOwnership }));
vi.mock("../supabase/admin", () => ({ createAdminClient: mocks.createAdminClient }));
vi.mock("../cases/events", () => ({ appendCaseEvent: mocks.appendCaseEvent }));

import { approveAndSendSupplierFollowup, buildSupplierFollowup, followupId, prepareSupplierFollowup } from "./followup-message";

const caseId = "5d5dc89e-aeeb-4afe-9b2e-dde126e7cece";
const userId = "03394e16-c236-4ad1-99fb-38259e8238ad";
const responseId = "bf487287-8068-4cd8-8333-3f2977490d68";
const source = (label: string) => ({ sourceArtifactId: caseId, sourceLabel: label, excerpt: `${label} line`, locator: null });
const difference = {
  id: "0:MAGGI:RATE_MISMATCH", type: "RATE_MISMATCH", skuRef: "MAGGI",
  description: "Billed rate exceeds the supplier's agreed rate on usable paid units",
  affectedQuantity: 20, expectedUnitPricePaise: 42800, billedUnitPricePaise: 44100,
  amountPaise: 26000, calculation: { kind: "rate_mismatch", inputs: { agreedUnitPricePaise: 42800, billedUnitPricePaise: 44100, saleableReceivedQuantity: 20 } },
  promisedEvidence: source("Supplier promise"), billedEvidence: source("Invoice"), receivedEvidence: source("Receiving note"),
  confidence: "high", status: "supported",
};
const response = {
  id: responseId, case_id: caseId, user_id: userId, direction: "inbound", source: "demo_supplier:golden_partial_credit",
  body: "We do not accept the rate difference.",
  parsed: { scenarioId: "golden_partial_credit", responseKind: "partial_credit_promised", appliedAt: "2026-10-03T10:00:00Z", analysis: {
    sourceMessageId: responseId, rawBody: "We do not accept the rate difference.", needsConfirmation: false, uncertainties: [],
    decisions: [{ discrepancyId: difference.id, outcome: "rejected", sourceExcerpt: "do not accept the rate difference",
      supplierAcknowledgedPaise: null, amountBasis: "none", coverage: "none", promisedForText: null, uncertainty: null }],
  } },
};

function fakeAdmin() {
  const rows = new Map<string, Record<string, unknown>>([[responseId, { ...response }]]);
  const updates: Array<Record<string, unknown>> = [];
  const claim = { status: "AWAITING_RECOVERY", claim_sent_at: "2026-10-03T09:00:00Z", discrepancies: [difference] };
  const admin = { from(table: string) {
    const filters: Array<[string, unknown]> = [];
    let patch: Record<string, unknown> | null = null;
    const query = {
      select() { return this; }, eq(key: string, value: unknown) { filters.push([key, value]); return this; },
      like() { return this; }, in() { return this; }, order() { return this; }, limit() { return this; },
      update(value: Record<string, unknown>) { patch = value; return this; },
      async insert(value: Record<string, unknown>) { rows.set(String(value.id), { ...value }); return { error: null }; },
      async maybeSingle() {
        const candidates = table === "cases" ? [claim] : [...rows.values()];
        const row = candidates.find((candidate) => filters.every(([key, value]) => candidate[key] === value));
        if (row && patch) { Object.assign(row, patch); updates.push(patch); }
        return { data: row ? { ...row } : null, error: null };
      },
      async single() { return { data: claim, error: null }; },
      then(resolve: (value: { error: null }) => unknown) {
        const row = [...rows.values()].find((candidate) => filters.every(([key, value]) => candidate[key] === value));
        if (row && patch) { Object.assign(row, patch); updates.push(patch); }
        return Promise.resolve({ error: null }).then(resolve);
      },
    };
    return query;
  } };
  return { admin, rows, updates };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireMerchant.mockResolvedValue({ supabase: {}, userId });
  mocks.assertCaseOwnership.mockResolvedValue(undefined);
  mocks.appendCaseEvent.mockResolvedValue(undefined);
});

describe("supplier correction approval", () => {
  it("drafts only the rejected item using persisted money and source proof", async () => {
    const db = fakeAdmin(); mocks.createAdminClient.mockReturnValue(db.admin);
    const draft = await prepareSupplierFollowup(caseId);
    expect(draft.status).toBe("awaiting_approval");
    expect(draft.id).toBe(followupId(caseId, responseId));
    expect(draft.body).toContain("₹260.00");
    expect(draft.body).toContain("Agreed rate: ₹428.00; billed rate: ₹441.00");
    expect(draft.body).toContain("Supplier promise line");
    expect(db.rows.get(draft.id)?.source).toBe("demo_followup_draft");
    expect(mocks.appendCaseEvent).toHaveBeenCalledTimes(1);
  });

  it("does not send before an authenticated approval, then sends exactly once", async () => {
    const db = fakeAdmin(); mocks.createAdminClient.mockReturnValue(db.admin);
    const draft = await prepareSupplierFollowup(caseId);
    expect(db.rows.get(draft.id)?.source).toBe("demo_followup_draft");
    const first = await approveAndSendSupplierFollowup(caseId, draft.id);
    const second = await approveAndSendSupplierFollowup(caseId, draft.id);
    expect(first.status).toBe("sent");
    expect(second.status).toBe("already_sent");
    expect(db.updates[0]).toHaveProperty("parsed.merchantApprovedAt");
    expect(db.updates[1]).toEqual({ source: "demo_followup_transport" });
    expect(mocks.appendCaseEvent).toHaveBeenCalledTimes(2);
  });

  it("does not create a correction when the supplier accepted the item", async () => {
    const db = fakeAdmin();
    const row = db.rows.get(responseId)!;
    const parsed = row.parsed as typeof response.parsed;
    row.parsed = { ...parsed, analysis: { ...parsed.analysis, decisions: [{ ...parsed.analysis.decisions[0], outcome: "accepted", supplierAcknowledgedPaise: 26000, amountBasis: "full_discrepancy", coverage: "full" }] } };
    mocks.createAdminClient.mockReturnValue(db.admin);
    await expect(prepareSupplierFollowup(caseId)).rejects.toThrow("no rejected claim item");
    expect(db.rows).toHaveProperty("size", 1);
  });

  it("formats the correction without calculating a new claim amount", () => {
    expect(buildSupplierFollowup([difference as Parameters<typeof buildSupplierFollowup>[0][number]])).toContain("₹260.00");
  });
});
