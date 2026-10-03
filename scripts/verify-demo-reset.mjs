import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const vitest = resolve(root, "node_modules/vitest/vitest.mjs");
const run = spawnSync(process.execPath, [vitest, "run", "src/lib/demo/reset.live.test.mjs"], {
  cwd: root,
  stdio: "inherit",
  env: { ...process.env, DEMO_LIVE_VERIFY: "true" },
});
if (run.error) throw run.error;
process.exitCode = run.status ?? 1;
