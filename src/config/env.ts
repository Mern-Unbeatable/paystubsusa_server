import { z } from "zod";

const bool = z.enum(["true", "false"]).transform((v) => v === "true");
const pem = z
  .string()
  .min(1)
  .transform((v) => v.replace(/\\n/g, "\n"));

const schema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().positive().default(4000),
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
    TRUST_PROXY: z.coerce.number().int().min(0).default(0),

    DATABASE_URL: z.string().url(),

    APP_URL: z.string().url(),
    CORS_ORIGINS: z
      .string()
      .min(1)
      .transform((v) => v.split(",").map((o) => o.trim()).filter(Boolean)),
    COOKIE_SECURE: bool.optional(),

    JWT_PRIVATE_KEY: pem,
    JWT_PUBLIC_KEY: pem,
    JWT_ISSUER: z.string().default("paystubsusa-api"),
    CODE_PEPPER: z.string().min(32),
    ENCRYPTION_MASTER_KEY: z
      .string()
      .refine((v) => Buffer.from(v, "base64").length === 32, "must be 32 bytes, base64-encoded"),
    ENCRYPTION_KEY_ID: z.string().min(1).default("local-v1"),

    STRIPE_SECRET_KEY: z.string().startsWith("sk_"),
    STRIPE_WEBHOOK_SECRET: z.string().startsWith("whsec_"),

    /** Public origin of this API, used in signed file-download links; defaults to localhost:PORT outside production. */
    PUBLIC_API_URL: z.string().url().optional(),

    STORAGE_DRIVER: z.enum(["local"]).default("local"),
    LOCAL_STORAGE_DIR: z.string().default(".storage"),

    MAIL_DRIVER: z.enum(["smtp", "log"]).default("log"),
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.coerce.number().int().positive().default(587),
    SMTP_SECURE: bool.default(false),
    SMTP_USER: z.string().optional(),
    SMTP_PASSWORD: z.string().optional(),
    MAIL_FROM: z.string().email().default("no-reply@paystubsusa.local"),
    SUPPORT_EMAIL: z.string().email().default("support@paystubsusa.local"),
    LOCAL_MAIL_DIR: z.string().default(".mail"),

    RENDERER_BUNDLE_PATH: z.string().optional(),
    CHROMIUM_EXECUTABLE_PATH: z.string().optional(),
    RENDER_CONCURRENCY: z.coerce.number().int().min(1).max(8).default(2),

    JOBS_ENABLED: bool.default(true),
    SCHEDULER_ENABLED: bool.default(true),
  })
  .superRefine((env, ctx) => {
    if (env.MAIL_DRIVER === "smtp") {
      for (const key of ["SMTP_HOST", "SMTP_USER", "SMTP_PASSWORD"] as const) {
        if (!env[key]) ctx.addIssue({ code: "custom", path: [key], message: "required when MAIL_DRIVER=smtp" });
      }
      if (env.MAIL_FROM.endsWith(".local")) {
        ctx.addIssue({ code: "custom", path: ["MAIL_FROM"], message: "set the sender address when MAIL_DRIVER=smtp (for Gmail, the SMTP_USER address)" });
      }
    }
    if (env.NODE_ENV === "production") {
      // `log` only writes files, so in production no email would ever reach a customer.
      if (env.MAIL_DRIVER !== "smtp") ctx.addIssue({ code: "custom", path: ["MAIL_DRIVER"], message: "must be smtp in production" });
      if (!env.PUBLIC_API_URL) ctx.addIssue({ code: "custom", path: ["PUBLIC_API_URL"], message: "required in production" });
      if (env.COOKIE_SECURE === false) ctx.addIssue({ code: "custom", path: ["COOKIE_SECURE"], message: "cannot be false in production" });
    }
  });

export type Env = z.infer<typeof schema>;

function load(): Env {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`);
    throw new Error(`Invalid environment configuration:\n${lines.join("\n")}`);
  }
  return parsed.data;
}

export const env = load();
export const isProduction = env.NODE_ENV === "production";
export const cookieSecure = env.COOKIE_SECURE ?? isProduction;
export const publicApiUrl = (env.PUBLIC_API_URL ?? `http://localhost:${env.PORT}`).replace(/\/+$/, "");
