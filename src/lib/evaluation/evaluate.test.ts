import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { evaluationCases } from "../../../fixtures/evaluation/cases";
import { evaluateCases } from "./evaluate";

describe("A7 measured synthetic evaluation", () => {
  it("runs 25 cases through the production deterministic functions and saves the result", async () => {
    const report = evaluateCases(evaluationCases);
    expect(report.dataset.cases).toBe(25);
    expect(report.dataset.byCategory).toEqual({ short: 6, rate: 5, scheme: 4, damage: 3, combined: 4, clean: 3 });
    expect(report.extraction.status).toBe("not_run");
    expect(report.matching.ambiguousDetected.total).toBeGreaterThan(0);
    expect(report.recoveryAllocationAndState.missing.total).toBeGreaterThan(0);
    expect(report.recoveryAllocationAndState.partial.total).toBeGreaterThan(0);
    expect(report.recoveryAllocationAndState.full.total).toBeGreaterThan(0);
    expect(report.failures).toEqual([]);
    await writeFile(resolve("fixtures/evaluation/latest-results.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  });
});
