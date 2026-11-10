import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { env } from "../../config/env.ts";

/** 256-bit random value, base64url. */
export const randomToken = (bytes = 32) => randomBytes(bytes).toString("base64url");

export const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");

/** HMAC-SHA256 with the server pepper; used for one-time codes and reset tokens. */
export const pepperedHash = (value: string) => createHmac("sha256", env.CODE_PEPPER).update(value).digest("hex");

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export const sixDigitCode = () => randomInt(0, 1_000_000).toString().padStart(6, "0");

/** RFC 9562 UUIDv7, for rows whose id must be known before insert (it is hashed into the row). */
export function uuidv7(): string {
  const b = randomBytes(16);
  const ms = BigInt(Date.now());
  for (let i = 0; i < 6; i++) b[i] = Number((ms >> BigInt(8 * (5 - i))) & 0xffn);
  b[6] = (b[6]! & 0x0f) | 0x70;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = b.toString("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
