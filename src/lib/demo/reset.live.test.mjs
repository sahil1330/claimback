import { createClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { aggregateSupplierMetrics } from "../suppliers/metrics";

const authMocks = vi.hoisted(() => ({ requireMerchant: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("../auth/session", () => ({ requireMerchant: authMocks.requireMerchant }));

import { DemoResetError, resetDemoForCurrentMerchant } from "./reset";

describe.skipIf(process.env.DEMO_LIVE_VERIFY !== "true")("live demo reset", () => {
  let merchant;
  let userId;

  beforeAll(async () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    const email = process.env.DEMO_USER_EMAIL;
    const password = process.env.DEMO_USER_PASSWORD;
    if (!url || !key || !email || !password) throw new Error("Demo environment is incomplete");
    merchant = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data, error } = await merchant.auth.signInWithPassword({ email, password });
    if (error || !data.user) throw error ?? new Error("Demo sign-in failed");
    userId = data.user.id;
    authMocks.requireMerchant.mockResolvedValue({ supabase: merchant, userId });
  });

  it("restores stable, merchant-visible money, obligations and source files three times", async () => {
    let firstIds;
    for (let attempt = 0; attempt < 3; attempt++) {
      const summary = await resetDemoForCurrentMerchant({ allowActiveCaseDeletion: true });
      expect(summary).toMatchObject({ suppliers: 2, historicalResolvedCases: 3,
        activeObligations: 1, marginProtectedPaise: 1_086_000,
        pendingRecoveryPaise: 156_000, openClaims: 3, syntheticDemoHistory: true });
      const { data: cases, error } = await merchant.from("cases")
        .select("id,supplier_id,status,potential_recovery_paise,recovered_paise,outstanding_paise,claim_sent_at,resolved_at,created_at")
        .order("id");
      if (error) throw error;
      expect(cases).toHaveLength(6);
      const ids = cases.map((item) => item.id);
      if (firstIds) expect(ids).toEqual(firstIds);
      else firstIds = ids;
      const { data: suppliers, error: supplierError } = await merchant.from("suppliers").select("id,name");
      if (supplierError) throw supplierError;
      const metrics = aggregateSupplierMetrics(suppliers, cases.map((item) => ({
        supplierId: item.supplier_id, status: item.status,
        potentialRecoveryPaise: BigInt(item.potential_recovery_paise),
        recoveredPaise: BigInt(item.recovered_paise),
        outstandingPaise: BigInt(item.outstanding_paise),
        claimSentAt: item.claim_sent_at, resolvedAt: item.resolved_at, createdAt: item.created_at,
      })));
      expect(metrics).toHaveLength(2);
      expect(metrics.reduce((sum, item) => sum + item.recoveredPaise, BigInt(0))).toBe(BigInt(1_086_000));
      expect(metrics.reduce((sum, item) => sum + item.pendingRecoveryPaise, BigInt(0))).toBe(BigInt(156_000));
      expect(cases.filter((item) => item.status !== "RESOLVED" &&
        (item.claim_sent_at || item.status === "AWAITING_MERCHANT_APPROVAL"))).toHaveLength(3);
    }
    const [{ data: obligations, error: obligationError }, { data: artifacts, error: artifactError }] =
      await Promise.all([
        merchant.from("recovery_obligations").select("id,status"),
        merchant.from("artifacts").select("storage_path"),
      ]);
    if (obligationError || artifactError) throw obligationError ?? artifactError;
    expect(obligations.filter((item) => item.status === "OPEN")).toHaveLength(1);
    expect(artifacts).toHaveLength(15);
    const { data: source, error: sourceError } = await merchant.storage.from("claimback-evidence")
      .download(artifacts[0].storage_path);
    if (sourceError) throw sourceError;
    expect((await source.text()).length).toBeGreaterThan(20);

    authMocks.requireMerchant.mockResolvedValueOnce({ supabase: merchant,
      userId: "11111111-1111-4111-8111-111111111111" });
    await expect(resetDemoForCurrentMerchant()).rejects.toBeInstanceOf(DemoResetError);
    authMocks.requireMerchant.mockResolvedValue({ supabase: merchant, userId });
  }, 120_000);
});
