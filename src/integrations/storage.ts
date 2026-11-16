import { createHmac } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { env } from "../config/env.ts";
import { safeEqual } from "../shared/crypto/tokens.ts";

/** Document PDF path helpers — single place for folder/file naming under LOCAL_STORAGE_DIR. */
export {
  buildDocumentStorageKey,
  isCurrentDocumentStorageKey,
  ownerDirectory,
  ownerId6,
  sanitizeSlug,
  type DocumentStorageKeyInput,
} from "../modules/documents/storage-key.ts";

/** Storage port; the container picks the implementation, so another provider can be added behind it. */
export interface ObjectStorage {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  /** Null when the object does not exist. */
  get(key: string): Promise<Buffer | null>;
  /**
   * Short-lived download path under `/api/v1` (e.g. `/local-files?...`).
   * Clients resolve it against their API base URL (same pattern as avatar URLs).
   */
  presignDownload(key: string, fileName: string, ttlSeconds: number): Promise<string>;
  delete(key: string): Promise<void>;
}

const disposition = (fileName: string) => `attachment; filename="${fileName.replace(/[^\w.-]/g, "_")}"`;

/**
 * Files under LOCAL_STORAGE_DIR (mount it on a persistent volume in production), downloaded
 * through the signed, expiring `/api/v1/local-files` route mounted in app.ts.
 */
export class LocalStorage implements ObjectStorage {
  private readonly root = path.resolve(env.LOCAL_STORAGE_DIR);

  private resolve(key: string) {
    const full = path.resolve(this.root, key);
    if (!full.startsWith(this.root + path.sep)) throw new Error("Invalid storage key");
    return full;
  }

  async put(key: string, body: Buffer) {
    const full = this.resolve(key);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, body);
  }

  async get(key: string) {
    return readFile(this.resolve(key)).catch((err: NodeJS.ErrnoException) => {
      if (err.code === "ENOENT") return null;
      throw err;
    });
  }

  async presignDownload(key: string, fileName: string, ttlSeconds: number) {
    const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
    const sig = signLocal(key, fileName, exp);
    const qs = new URLSearchParams({ key, name: fileName, exp: String(exp), sig });
    return `/local-files?${qs}`;
  }

  async read(key: string, fileName: string, exp: number, sig: string) {
    if (exp < Date.now() / 1000 || !safeEqual(sig, signLocal(key, fileName, exp))) {
      return { ok: false as const, reason: "invalid" as const };
    }
    const body = await this.get(key);
    if (!body) return { ok: false as const, reason: "missing" as const, key };
    return { ok: true as const, body, disposition: disposition(fileName) };
  }

  async delete(key: string) {
    await rm(this.resolve(key), { force: true });
  }
}

const signLocal = (key: string, fileName: string, exp: number) =>
  createHmac("sha256", env.CODE_PEPPER).update(`local-file|${key}|${fileName}|${exp}`).digest("hex");
