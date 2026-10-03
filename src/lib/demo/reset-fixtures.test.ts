import { describe, expect, it } from "vitest";
import { discrepancySchema } from "../../types/domain";
import { buildDemoResetPlan } from "./reset-fixtures";

const userId = "03394e16-c236-4ad1-99fb-38259e8238ad";

describe("repeatable synthetic demo state", () => {
  it("restores the scripted Sharma Medical numbers from reconciled source facts", () => {
    const plan = buildDemoResetPlan(userId);
    expect(plan).toEqual(buildDemoResetPlan(userId));
    expect(plan.suppliers).toHaveLength(2);
    expect(plan.cases).toHaveLength(6);
    expect(plan.cases.filter((row) => row.status === "RESOLVED")).toHaveLength(3);
    expect(plan.obligations.filter((row) => row.status === "OPEN")).toHaveLength(1);
    expect(plan.cases.reduce((sum, row) => sum + Number(row.recovered_paise), 0)).toBe(1_086_000);
    expect(plan.cases.filter((row) => row.claim_sent_at && row.status !== "RESOLVED")
      .reduce((sum, row) => sum + Number(row.outstanding_paise), 0)).toBe(156_000);
    expect(plan.cases.filter((row) => row.status !== "RESOLVED" &&
      (row.claim_sent_at || row.status === "AWAITING_MERCHANT_APPROVAL"))).toHaveLength(3);
    expect(plan.summary).toMatchObject({ businessName: "Sharma Medical", openClaims: 3 });
  });

  it("keeps every seeded discrepancy tied to a real uploaded source path", () => {
    const plan = buildDemoResetPlan(userId);
    const artifactIds = new Set(plan.artifacts.map((row) => row.id));
    const storagePaths = new Set(plan.files.map((file) => file.path));
    for (const artifact of plan.artifacts) expect(storagePaths.has(artifact.storage_path as string)).toBe(true);
    for (const row of plan.cases) {
      const discrepancies = discrepancySchema.array().min(1).parse(row.discrepancies);
      expect(discrepancies.reduce((sum, item) => sum + item.amountPaise, 0)).toBe(row.potential_recovery_paise);
      for (const item of discrepancies) {
        expect(artifactIds.has(item.promisedEvidence.sourceArtifactId)).toBe(true);
        expect(artifactIds.has(item.billedEvidence.sourceArtifactId)).toBe(true);
        expect(item.receivedEvidence.sourceArtifactId).toBe(row.id);
      }
    }
  });
});
