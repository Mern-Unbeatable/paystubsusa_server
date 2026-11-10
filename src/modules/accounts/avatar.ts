import sharp from "sharp";
import { validation } from "../../shared/http/app-error.ts";

export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
const SIZE = 256;

const isPng = (b: Buffer) => b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
const isJpeg = (b: Buffer) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
const isWebp = (b: Buffer) => b.length > 12 && b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP";

export const invalidAvatar = (message: string) => validation({ avatar: [message] });

/** Checks magic bytes, then re-encodes to a square WebP (strips metadata and any non-image payload). */
export async function normalizeAvatar(buf: Buffer): Promise<Buffer> {
  if (!isPng(buf) && !isJpeg(buf) && !isWebp(buf)) throw invalidAvatar("Use a JPG, PNG or WebP image");
  try {
    return await sharp(buf, { limitInputPixels: 50_000_000 })
      .rotate()
      .resize(SIZE, SIZE, { fit: "cover" })
      .webp({ quality: 85 })
      .toBuffer();
  } catch {
    throw invalidAvatar("This image could not be read");
  }
}
