import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const connectionString = process.env.SUPABASE_DB_URL;
const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!connectionString || !projectUrl) throw new Error("Set the local Supabase database URL and project URL");
const database = new URL(connectionString);
const projectRef = new URL(projectUrl).hostname.split(".")[0];
const user = decodeURIComponent(database.username);
const isProjectConnection =
  (user === `postgres.${projectRef}` && database.hostname.endsWith(".pooler.supabase.com")) ||
  (user === "postgres" && database.hostname === `db.${projectRef}.supabase.co`);
if (!["postgres:", "postgresql:"].includes(database.protocol) || !isProjectConnection ||
    database.pathname !== "/postgres" || (database.port && database.port !== "5432") || !database.password) {
  throw new Error("SUPABASE_DB_URL must point to this project's direct or Session pooler database on port 5432");
}
const env = { ...process.env, PGPASSWORD: decodeURIComponent(database.password), PGSSLMODE: "require" };
const result = spawnSync("psql", [
  "-X", "-w", "-v", "ON_ERROR_STOP=1", "-h", database.hostname,
  "-p", database.port || "5432", "-U", user, "-d", database.pathname.slice(1),
  "-f", resolve("supabase/tests/recovery_verification.sql"),
], { env, stdio: "inherit" });
if (result.error) throw result.error;
if (result.status !== 0) process.exitCode = result.status ?? 1;
