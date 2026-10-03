import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const connectionString = process.env.SUPABASE_DB_URL;
const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!connectionString || !projectUrl) {
  throw new Error("Set SUPABASE_DB_URL and NEXT_PUBLIC_SUPABASE_URL in .env.local");
}

const database = new URL(connectionString);
const projectRef = new URL(projectUrl).hostname.split(".")[0];
const user = decodeURIComponent(database.username);
const isProjectConnection =
  (user === `postgres.${projectRef}` && database.hostname.endsWith(".pooler.supabase.com")) ||
  (user === "postgres" && database.hostname === `db.${projectRef}.supabase.co`);
if (
  !["postgres:", "postgresql:"].includes(database.protocol) ||
  !isProjectConnection || database.pathname !== "/postgres" ||
  (database.port && database.port !== "5432") || !database.password
) {
  throw new Error("SUPABASE_DB_URL must be this project's direct or Session pooler Postgres URL on port 5432");
}

const args = ["-X", "-w", "-v", "ON_ERROR_STOP=1", "-h", database.hostname,
  "-p", database.port || "5432", "-U", user, "-d", database.pathname.slice(1)];
const env = { ...process.env, PGPASSWORD: decodeURIComponent(database.password), PGSSLMODE: "require" };
const probe = spawnSync("psql", [...args, "-Atc",
  "select to_regclass('public.recovery_verifications') is not null"], { env, encoding: "utf8" });
if (probe.error) throw probe.error;
if (probe.status !== 0) {
  process.stderr.write(probe.stderr);
  process.exit(probe.status ?? 1);
}
if (probe.stdout.trim() === "t") {
  console.log("Recovery verification migration already present; skipping");
  process.exit(0);
}
const migration = resolve("supabase/migrations/20261003000200_recovery_verification.sql");
const result = spawnSync("psql", [...args, "-1", "-f", migration], { env, stdio: "inherit" });
if (result.error) throw result.error;
if (result.status !== 0) process.exitCode = result.status ?? 1;
