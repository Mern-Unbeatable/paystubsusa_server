/**
 * Runs before each test file, before any app module reads `env`.
 * `.env.test` supplies DATABASE_URL for integration tests; everything else gets throwaway values.
 */
import { generateKeyPairSync, randomBytes } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import { config } from "dotenv";

config({ path: ".env.test", quiet: true });

const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const defaults: Record<string, string> = {
  NODE_ENV: "test",
  LOG_LEVEL: "silent",
  DATABASE_URL: "postgresql://unit:unit@127.0.0.1:1/unit",
  APP_URL: "http://localhost:5173",
  CORS_ORIGINS: "http://localhost:5173",
  COOKIE_SECURE: "false",
  JWT_PRIVATE_KEY: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
  JWT_PUBLIC_KEY: publicKey.export({ type: "spki", format: "pem" }).toString(),
  CODE_PEPPER: randomBytes(32).toString("base64url"),
  ENCRYPTION_MASTER_KEY: randomBytes(32).toString("base64"),
  STRIPE_SECRET_KEY: "sk_test_unit",
  STRIPE_WEBHOOK_SECRET: "whsec_unit_test_secret",
  STORAGE_DRIVER: "local",
  LOCAL_STORAGE_DIR: path.join(tmpdir(), "paystubsusa-test-storage"),
  MAIL_DRIVER: "log",
  LOCAL_MAIL_DIR: path.join(tmpdir(), "paystubsusa-test-mail"),
  JOBS_ENABLED: "false",
  SCHEDULER_ENABLED: "false",
};
for (const [k, v] of Object.entries(defaults)) process.env[k] ??= v;

export const hasDatabase = !process.env["DATABASE_URL"]!.includes("127.0.0.1:1/unit");
