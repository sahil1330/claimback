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
  !isProjectConnection ||
  database.pathname !== "/postgres" ||
  (database.port && database.port !== "5432") ||
  !database.password
) {
  throw new Error("SUPABASE_DB_URL must be this project's direct or Session pooler Postgres URL on port 5432");
}

const migration = resolve("supabase/migrations/20261003000100_foundation.sql");
const args = [
  "-X", "-w", "-v", "ON_ERROR_STOP=1",
  "-h", database.hostname,
  "-p", database.port || "5432",
  "-U", user,
  "-d", database.pathname.slice(1),
];
const env = {
  ...process.env,
  PGPASSWORD: decodeURIComponent(database.password),
  PGSSLMODE: "require",
};

const tableProbe = spawnSync("psql", [
  ...args,
  "-Atc",
  `select count(*) from (values
    ('public.profiles'), ('public.suppliers'), ('public.cases'),
    ('public.artifacts'), ('public.supplier_messages'),
    ('public.recovery_obligations'), ('public.case_events')
  ) as wanted(name) where to_regclass(name) is not null`,
], { env, encoding: "utf8" });
if (tableProbe.error) throw tableProbe.error;
if (tableProbe.status !== 0) {
  process.stderr.write(tableProbe.stderr);
  process.exit(tableProbe.status ?? 1);
}

const existingTables = Number(tableProbe.stdout.trim());
if (existingTables === 7) {
  console.log("Foundation tables already present; skipping migration");
  process.exit(0);
}
if (existingTables !== 0) {
  throw new Error("A partial foundation schema exists; inspect it before applying the migration");
}

const result = spawnSync("psql", [...args, "-1", "-f", migration], {
  env,
  stdio: "inherit",
});

if (result.error) throw result.error;
if (result.status !== 0) process.exitCode = result.status ?? 1;
