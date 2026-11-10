import { createHmac } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "../config/env.ts";
import { safeEqual } from "../shared/crypto/tokens.ts";

export interface ObjectStorage {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  /** Short-lived GET URL that downloads as `fileName`. */
  presignDownload(key: string, fileName: string, ttlSeconds: number): Promise<string>;
  delete(key: string): Promise<void>;
}

const disposition = (fileName: string) => `attachment; filename="${fileName.replace(/[^\w.-]/g, "_")}"`;

export class S3Storage implements ObjectStorage {
  private readonly client = new S3Client({
    region: env.S3_REGION,
    endpoint: env.S3_ENDPOINT,
    forcePathStyle: Boolean(env.S3_ENDPOINT),
    credentials:
      env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY
        ? { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY }
        : undefined,
  });
  private readonly bucket = env.S3_BUCKET ?? "";

  async put(key: string, body: Buffer, contentType: string) {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        ServerSideEncryption: env.S3_ENDPOINT ? undefined : "aws:kms",
      }),
    );
  }

  presignDownload(key: string, fileName: string, ttlSeconds: number) {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucket, Key: key, ResponseContentDisposition: disposition(fileName) }),
      { expiresIn: ttlSeconds },
    );
  }

  async delete(key: string) {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}

/**
 * Development only (env.ts forbids it in production): files under LOCAL_STORAGE_DIR,
 * served by the signed `/api/v1/local-files` route mounted in app.ts.
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

  async presignDownload(key: string, fileName: string, ttlSeconds: number) {
    const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
    const sig = signLocal(key, fileName, exp);
    const qs = new URLSearchParams({ key, name: fileName, exp: String(exp), sig });
    return `http://localhost:${env.PORT}/api/v1/local-files?${qs}`;
  }

  async read(key: string, fileName: string, exp: number, sig: string) {
    if (exp < Date.now() / 1000 || !safeEqual(sig, signLocal(key, fileName, exp))) return null;
    return { body: await readFile(this.resolve(key)), disposition: disposition(fileName) };
  }

  async delete(key: string) {
    await rm(this.resolve(key), { force: true });
  }
}

const signLocal = (key: string, fileName: string, exp: number) =>
  createHmac("sha256", env.CODE_PEPPER).update(`local-file|${key}|${fileName}|${exp}`).digest("hex");
