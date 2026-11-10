import sharp from "sharp";
import { validation } from "../../shared/http/app-error.ts";

const MAX_BYTES = 2 * 1024 * 1024;
const MAX_DIMENSION = 1200;

const isPng = (b: Buffer) => b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
const isJpeg = (b: Buffer) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;

const invalid = (message: string) => validation({ "formData.companyLogo": [message] });

/**
 * Decodes a PNG/JPEG data URL, checks size and magic bytes, then re-encodes it with sharp
 * (strips metadata and any non-image payload) at ≤ 1200 px.
 */
export async function normalizeLogo(dataUrl: string): Promise<string> {
  const comma = dataUrl.indexOf(",");
  const buf = Buffer.from(dataUrl.slice(comma + 1), "base64");
  if (buf.length > MAX_BYTES) throw invalid("Logo must be 2 MB or smaller");
  const png = isPng(buf);
  if (!png && !isJpeg(buf)) throw invalid("Logo must be a PNG or JPEG image");

  try {
    const pipeline = sharp(buf, { limitInputPixels: 50_000_000 }).rotate().resize({
      width: MAX_DIMENSION,
      height: MAX_DIMENSION,
      fit: "inside",
      withoutEnlargement: true,
    });
    const out = png ? await pipeline.png().toBuffer() : await pipeline.jpeg({ quality: 90 }).toBuffer();
    return `data:image/${png ? "png" : "jpeg"};base64,${out.toString("base64")}`;
  } catch {
    throw invalid("Logo image could not be read");
  }
}
