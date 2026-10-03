import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { evaluationCases } from "../../../fixtures/evaluation/cases";
import { evaluateLiveExtraction } from "./live-extraction";

const enabled = process.env.EVALUATION_LIVE === "1";

(enabled ? it : it.skip)("measures actual extraction on explicitly selected synthetic text", async () => {
  const selection = process.env.EVALUATION_LIVE_IDS ?? "C01,N01,R01";
  const selectedIds = selection === "all"
    ? evaluationCases.map(({ id }) => id)
    : selection.split(",").map((id) => id.trim()).filter(Boolean);
  const report = await evaluateLiveExtraction(evaluationCases, selectedIds);
  expect(report.totalCalls).toBe(selectedIds.length * 2);
  await writeFile(resolve("fixtures/evaluation/latest-live-results.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
}, 900_000);
