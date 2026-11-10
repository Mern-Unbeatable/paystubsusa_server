import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { env } from "../../config/env.ts";

// Envelope encryption: each payload gets its own AES-256-GCM data key, wrapped by the master key.
// Layout: [1 version][12 wrapIv][16 wrapTag][32 wrappedKey][12 iv][16 tag][ciphertext]
const VERSION = 1;
const IV = 12;
const TAG = 16;
const KEY = 32;

// shortcut: one master key from the environment, move to KMS (wrap/unwrap calls) and a key-id map when keys rotate.
const masterKey = () => Buffer.from(env.ENCRYPTION_MASTER_KEY, "base64");

function seal(key: Buffer, plaintext: Buffer) {
  const iv = randomBytes(IV);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return { iv, tag: cipher.getAuthTag(), ciphertext };
}

function open(key: Buffer, iv: Buffer, tag: Buffer, ciphertext: Buffer) {
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

export function encryptJson(value: unknown): { blob: Uint8Array<ArrayBuffer>; keyId: string } {
  const dataKey = randomBytes(KEY);
  const wrapped = seal(masterKey(), dataKey);
  const body = seal(dataKey, Buffer.from(JSON.stringify(value), "utf8"));
  const blob = Buffer.concat([
    Buffer.from([VERSION]),
    wrapped.iv,
    wrapped.tag,
    wrapped.ciphertext,
    body.iv,
    body.tag,
    body.ciphertext,
  ]);
  return { blob: new Uint8Array(blob), keyId: env.ENCRYPTION_KEY_ID };
}

export function decryptJson<T = unknown>(blob: Uint8Array, keyId: string): T {
  if (keyId !== env.ENCRYPTION_KEY_ID) throw new Error(`Unknown encryption key id: ${keyId}`);
  const buf = Buffer.from(blob);
  if (buf[0] !== VERSION) throw new Error("Unsupported ciphertext version");
  let o = 1;
  const take = (n: number) => buf.subarray(o, (o += n));
  const wrapIv = take(IV);
  const wrapTag = take(TAG);
  const wrappedKey = take(KEY);
  const dataKey = open(masterKey(), wrapIv, wrapTag, wrappedKey);
  const iv = take(IV);
  const tag = take(TAG);
  return JSON.parse(open(dataKey, iv, tag, buf.subarray(o)).toString("utf8")) as T;
}
