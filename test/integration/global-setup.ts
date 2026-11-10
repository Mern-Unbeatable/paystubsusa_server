/** Migrates and seeds the test database once per run. No-op without `.env.test`. */
import { execSync } from "node:child_process";
import { config } from "dotenv";

export default function setup() {
  config({ path: ".env.test", quiet: true });
  const url = process.env["DATABASE_URL"];
  if (!url) return;
  assertTestDatabase(url);
  const run = (cmd: string) => execSync(cmd, { stdio: "inherit", env: process.env });
  run("npx prisma migrate deploy");
  run("node test/integration/seed-test-db.ts");
}

/** Integration tests truncate tables: never point them at a non-test database. */
export function assertTestDatabase(url: string) {
  const name = new URL(url).pathname.slice(1);
  if (!/test/i.test(name)) throw new Error(`Refusing to run integration tests against database "${name}" (name must contain "test")`);
}
