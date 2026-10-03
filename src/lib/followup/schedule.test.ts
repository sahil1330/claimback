import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireMerchant: vi.fn(), assertCaseOwnership: vi.fn(),
  createAdminClient: vi.fn(), appendCaseEvent: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("../auth/session", () => ({ requireMerchant: mocks.requireMerchant }));
vi.mock("../auth/case-access", () => ({ assertCaseOwnership: mocks.assertCaseOwnership }));
vi.mock("../supabase/admin", () => ({ createAdminClient: mocks.createAdminClient }));
vi.mock("../cases/events", () => ({ appendCaseEvent: mocks.appendCaseEvent }));

import { FollowupScheduleError, parseFollowupRequest, readCaseFollowup, scheduleCaseFollowup } from "./schedule";

const caseId = "5d5dc89e-aeeb-4afe-9b2e-dde126e7cece";
const userId = "03394e16-c236-4ad1-99fb-38259e8238ad";
type Row = {
  status: string; claim_sent_at: string | null; outstanding_paise: number;
  recovered_paise: number; next_follow_up_at: string | null; updated_at: string;
};

function fakeAdmin(row: Row) {
  const updates: Partial<Row>[] = [];
  return {
    updates,
    client: { from(table: string) {
      if (table !== "cases") throw new Error(`Unexpected table: ${table}`);
      let patch: Partial<Row> | null = null;
      const filters: Array<[string, unknown]> = [];
      const query = {
        select() { return this; },
        eq(key: string, value: unknown) { filters.push([key, value]); return this; },
        gt(key: string, value: number) {
          if (key !== "outstanding_paise") throw new Error(`Unexpected filter: ${key}`);
          filters.push([key, row.outstanding_paise > value]);
          return this;
        },
        update(value: Partial<Row>) { patch = value; updates.push(value); return this; },
        async single() { return { data: { ...row }, error: null }; },
        async maybeSingle() {
          const matches = filters.every(([key, value]) => key === "outstanding_paise"
            ? value === true : key === "id" || key === "user_id" || row[key as keyof Row] === value);
          if (!matches) return { data: null, error: null };
          if (patch) Object.assign(row, patch);
          return { data: { ...row }, error: null };
        },
      };
      return query;
    } },
  };
}

function caseRow(overrides: Partial<Row> = {}): Row {
  return { status: "AWAITING_RECOVERY", claim_sent_at: "2026-10-03T08:00:00Z",
    outstanding_paise: 156_000, recovered_paise: 0, next_follow_up_at: null,
    updated_at: "2026-10-03T08:00:00Z", ...overrides };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireMerchant.mockResolvedValue({ supabase: {}, userId });
  mocks.assertCaseOwnership.mockResolvedValue({ id: caseId, user_id: userId });
  mocks.appendCaseEvent.mockResolvedValue(undefined);
});

describe("supplier follow-up scheduling", () => {
  it("accepts only a future absolute time within 90 days and a safe reason", () => {
    const now = Date.parse("2026-10-03T08:00:00Z");
    expect(parseFollowupRequest({ scheduledFor: "2026-10-04T13:30:00+05:30", reason: "promised_credit" }, now))
      .toEqual({ scheduledFor: "2026-10-04T08:00:00.000Z", reason: "promised_credit" });
    expect(() => parseFollowupRequest({ scheduledFor: "2026-10-03T08:00:00Z", reason: "promised_credit" }, now))
      .toThrow(FollowupScheduleError);
    expect(() => parseFollowupRequest({ scheduledFor: "2027-03-01T08:00:00Z", reason: "promised_credit" }, now))
      .toThrow(FollowupScheduleError);
    expect(() => parseFollowupRequest({ scheduledFor: "2026-10-04T08:00:00Z", reason: "freeform supplier text" }, now))
      .toThrow();
  });

  it("stores only the reminder time and safe event for an owned outstanding claim", async () => {
    const row = caseRow();
    const db = fakeAdmin(row);
    mocks.createAdminClient.mockReturnValue(db.client);
    const scheduledFor = new Date(Date.now() + 3_600_000).toISOString();
    const result = await scheduleCaseFollowup(caseId, { scheduledFor, reason: "promised_credit" });
    expect(result).toEqual({ caseId, scheduledFor, reason: "promised_credit" });
    expect(row.next_follow_up_at).toBe(scheduledFor);
    expect(row.recovered_paise).toBe(0);
    expect(row.outstanding_paise).toBe(156_000);
    expect(row.status).toBe("AWAITING_RECOVERY");
    expect(Object.keys(db.updates[0]).sort()).toEqual(["next_follow_up_at", "updated_at"]);
    expect(mocks.appendCaseEvent).toHaveBeenCalledWith(db.client, expect.objectContaining({
      eventType: "followup_scheduled", details: { scheduledFor, reason: "promised_credit" },
    }));
  });

  it("does not schedule a resolved claim or use admin access after ownership denial", async () => {
    const row = caseRow({ status: "RESOLVED", outstanding_paise: 0 });
    const db = fakeAdmin(row);
    mocks.createAdminClient.mockReturnValue(db.client);
    const input = { scheduledFor: new Date(Date.now() + 3_600_000).toISOString(), reason: "manual_review" };
    await expect(scheduleCaseFollowup(caseId, input)).rejects.toBeInstanceOf(FollowupScheduleError);
    expect(db.updates).toHaveLength(0);
    expect(mocks.appendCaseEvent).not.toHaveBeenCalled();
    mocks.createAdminClient.mockClear();
    mocks.assertCaseOwnership.mockRejectedValueOnce(new Error("Access denied"));
    await expect(scheduleCaseFollowup(caseId, input)).rejects.toThrow("Access denied");
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it("reads the reason from the latest owned event despite timestamp formatting", async () => {
    const merchant = { from(table: string) {
      const query = {
        select() { return this; }, eq() { return this; }, order() { return this; },
        async single() {
          if (table !== "cases") throw new Error("Unexpected single query");
          return { data: { status: "AWAITING_RECOVERY", outstanding_paise: 156_000,
            next_follow_up_at: "2026-10-04T08:00:00+00:00" }, error: null };
        },
        async limit() {
          if (table !== "case_events") throw new Error("Unexpected event query");
          return { data: [{ payload: { details: { scheduledFor: "2026-10-04T08:00:00.000Z",
            reason: "promised_credit" } } }], error: null };
        },
      };
      return query;
    } };
    mocks.requireMerchant.mockResolvedValueOnce({ supabase: merchant, userId });
    expect(await readCaseFollowup(caseId)).toEqual({ followup: {
      scheduledFor: "2026-10-04T08:00:00+00:00", reason: "promised_credit",
    } });
  });
});
