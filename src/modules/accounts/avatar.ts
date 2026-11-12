import sharp from "sharp";
import { validation } from "../../shared/http/app-error.ts";
import { isSupportedImage } from "../../shared/http/image-upload.ts";

export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
const SIZE = 256;

export const invalidAvatar = (message: string) => validation({ avatar: [message] });

/** Checks magic bytes, then re-encodes to a square WebP (strips metadata and any non-image payload). */
export async function normalizeAvatar(buf: Buffer): Promise<Buffer> {
  if (!isSupportedImage(buf)) throw invalidAvatar("Use a JPG, PNG or WebP image");
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
