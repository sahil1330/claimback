import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const vitest = resolve(root, "node_modules/vitest/vitest.mjs");
const run = spawnSync(process.execPath, [vitest, "run", "src/lib/evaluation/evaluate.test.ts", "--reporter=dot"], {
  cwd: root,
  stdio: "inherit",
});
if (run.error) throw run.error;
if (run.status !== 0) process.exit(run.status ?? 1);

const report = JSON.parse(readFileSync(resolve(root, "fixtures/evaluation/latest-results.json"), "utf8"));
const show = ({ correct, total }) => `${correct}/${total}`;
console.log(`Evaluation cases: ${report.dataset.cases} synthetic scenarios`);
console.log("Invoice/agreement extraction accuracy: not measured (no model calls)");
console.log(`SKU matches/classifications correct: ${show(report.matching)}`);
console.log(`Ambiguous matches detected: ${show(report.matching.ambiguousDetected)}`);
console.log(`Discrepancy type sets correct: ${show(report.discrepancies.exactTypeSets)}`);
console.log(`Clean-delivery false claims: ${report.discrepancies.cleanFalseClaims}/${report.discrepancies.cleanCases}`);
console.log(`Exact money totals from confirmed facts: ${show(report.money)}`);
console.log(`Source-grounded discrepancy records: ${show(report.sourceGrounding)}`);
console.log(`Recovery allocation/state steps correct: ${show(report.recoveryAllocationAndState)}`);
console.log("Detailed report: fixtures/evaluation/latest-results.json");
