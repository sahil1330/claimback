import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

if (!process.env.OPENAI_API_KEY || !process.env.OPENAI_EXTRACTION_MODEL) {
  throw new Error("OPENAI_API_KEY and OPENAI_EXTRACTION_MODEL are required for the opt-in live evaluation");
}

const root = resolve(import.meta.dirname, "..");
const vitest = resolve(root, "node_modules/vitest/vitest.mjs");
const selection = process.argv[2] ?? "C01,N01,R01";
const run = spawnSync(process.execPath, [vitest, "run", "src/lib/evaluation/live-extraction.live.test.ts", "--reporter=dot"], {
  cwd: root,
  env: { ...process.env, EVALUATION_LIVE: "1", EVALUATION_LIVE_IDS: selection },
  stdio: "inherit",
});
if (run.error) throw run.error;
if (run.status !== 0) process.exit(run.status ?? 1);

const report = JSON.parse(readFileSync(resolve(root, "fixtures/evaluation/latest-live-results.json"), "utf8"));
const count = ({ correct, total }) => `${correct}/${total}`;
const statuses = ({ ready, needsConfirmation, error }) => `${ready} ready, ${needsConfirmation} needs confirmation, ${error} errors`;
console.log(`Live extraction: ${report.dataset.casesAttempted}/${report.dataset.casesAvailable} synthetic text cases, ${report.totalCalls} model calls`);
console.log(`Invoice selected fields correct: ${count(report.invoice.fields)}; ${statuses(report.invoice.status)}`);
console.log(`Agreement selected fields correct: ${count(report.agreement.fields)}; ${statuses(report.agreement.status)}`);
console.log("Detailed report: fixtures/evaluation/latest-live-results.json");
