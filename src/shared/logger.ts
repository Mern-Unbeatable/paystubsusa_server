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
  "ssnLast4",
  "ein",
  "companyEin",
  "payerTin",
  "recipientTin",
  "accountNumber",
  "routingNumber",
  "accountHolderName",
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
      "steps.directDeposit",
      "*.steps.directDeposit",
      "*.*.steps.directDeposit",
      "directDeposit.accountNumber",
      "directDeposit.routingNumber",
      "*.directDeposit.accountNumber",
      "*.directDeposit.routingNumber",
      'req.headers["authorization"]',
      'req.headers["cookie"]',
      'req.headers["x-guest-token"]',
      'res.headers["set-cookie"]',
    ],
    censor: "[REDACTED]",
  },
  // Readable output in development and production; plain JSON in tests.
  ...(env.NODE_ENV !== "test"
    ? { transport: { target: "pino-pretty", options: { translateTime: "SYS:HH:MM:ss.l", ignore: "pid,hostname,req,res,responseTime" } } }
    : {}),
});
