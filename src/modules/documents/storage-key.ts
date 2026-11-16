import { createHash } from "node:crypto";
import type { DocumentType } from "../../generated/prisma/enums.ts";

const SLUG_MAX = 40;

/** Lowercase filesystem-safe slug; empty/invalid input becomes `user`. */
export function sanitizeSlug(input: string | null | undefined): string {
  const slug = String(input ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SLUG_MAX)
    .replace(/-+$/g, "");
  return slug || "user";
}

/** Email local-part before `@`, otherwise the whole string. */
export function emailLocalPart(email: string): string {
  const at = email.indexOf("@");
  return at > 0 ? email.slice(0, at) : email;
}

/**
 * Short immutable owner suffix so `john@a.com` and `john@b.com` never share a folder.
 * Customers: first 6 hex chars of user id. Guests: first 6 hex of sha256(email).
 */
export function ownerId6(input: { userId?: string | null; email: string }): string {
  if (input.userId) {
    const hex = input.userId.replace(/-/g, "").toLowerCase();
    if (hex.length >= 6) return hex.slice(0, 6);
  }
  return createHash("sha256").update(input.email.trim().toLowerCase()).digest("hex").slice(0, 6);
}

/** `documents/{prefix}_{id6}/` — email prefix is visible; id6 prevents collisions. */
export function ownerDirectory(input: { email: string; userId?: string | null }): string {
  const prefix = sanitizeSlug(emailLocalPart(input.email));
  const id6 = ownerId6(input);
  return `${prefix}_${id6}`;
}

export function filePrefixForType(type: DocumentType | string): string {
  switch (type) {
    case "paystub":
      return "paystub";
    case "w2":
      return "w2";
    case "nec1099":
      return "nec1099";
    case "direct_deposit":
      return "direct_deposit";
    default:
      return sanitizeSlug(String(type));
  }
}

/** Current layout: documents/{email-prefix}_{id6}/{YYYY}/{MM}/{type}_{NNN}.pdf */
export function isCurrentDocumentStorageKey(key: string): boolean {
  return /^documents\/[a-z0-9-]+_[0-9a-f]{6}\/\d{4}\/\d{2}\/[a-z0-9-]+_\d{3}\.pdf$/.test(key);
}

/** @deprecated alias kept for migration script imports */
export const isNewDocumentStorageKey = isCurrentDocumentStorageKey;

export interface DocumentStorageKeyInput {
  createdAt: Date;
  email: string;
  userId?: string | null;
  type: DocumentType | string;
  /** 1-based sequence within the owner / year / month folder (stable across regenerations). */
  sequence: number;
}

/**
 * Relative storage key:
 * `documents/{email-prefix}_{id6}/{YYYY}/{MM}/{type}_{NNN}.pdf`
 */
export function buildDocumentStorageKey(input: DocumentStorageKeyInput): string {
  const yyyy = input.createdAt.getUTCFullYear();
  const mm = String(input.createdAt.getUTCMonth() + 1).padStart(2, "0");
  const owner = ownerDirectory({ email: input.email, userId: input.userId });
  const seq = Math.max(1, Math.floor(input.sequence));
  const file = `${filePrefixForType(input.type)}_${String(seq).padStart(3, "0")}.pdf`;
  return `documents/${owner}/${yyyy}/${mm}/${file}`;
}
