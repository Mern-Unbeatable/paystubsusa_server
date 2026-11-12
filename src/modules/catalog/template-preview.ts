import sharp from "sharp";
import { validation } from "../../shared/http/app-error.ts";
import { isSupportedImage } from "../../shared/http/image-upload.ts";

export const TEMPLATE_PREVIEW_MAX_BYTES = 4 * 1024 * 1024;
const MAX_WIDTH = 1200;

export const invalidPreview = (message: string) => validation({ image: [message] });

/** Checks magic bytes, then re-encodes to WebP (strips metadata and any non-image payload). */
export async function normalizePreview(buf: Buffer): Promise<Buffer> {
  if (!isSupportedImage(buf)) throw invalidPreview("Use a JPG, PNG or WebP image");
  try {
    return await sharp(buf, { limitInputPixels: 50_000_000 })
      .rotate()
      .resize({ width: MAX_WIDTH, withoutEnlargement: true })
      .webp({ quality: 85 })
      .toBuffer();
  } catch {
    throw invalidPreview("This image could not be read");
  }
}
