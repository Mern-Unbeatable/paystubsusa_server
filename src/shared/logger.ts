import { pino } from "pino";
import { env } from "../config/env.ts";

// Request bodies are never logged; this guards objects passed to logger calls.
const SENSITIVE = [
  "password",
  "currentPassword",
  "newPassword",
  "token",
  "guestToken",
  "accessToken",
  "refreshToken",
  "formData",
  "ssn",
  "ein",
  "companyEin",
  "payerTin",
  "recipientTin",
  "accountNumber",
  "recipientAccountNumber",
  "clientSecret",
  "authorization",
  "cookie",
];

export const logger = pino({
  level: env.LOG_LEVEL,
  redact: {
    paths: [
      ...SENSITIVE,
      ...SENSITIVE.map((k) => `*.${k}`),
      ...SENSITIVE.map((k) => `*.*.${k}`),
      'req.headers["authorization"]',
      'req.headers["cookie"]',
      'req.headers["x-guest-token"]',
      'res.headers["set-cookie"]',
    ],
    censor: "[REDACTED]",
  },
});
