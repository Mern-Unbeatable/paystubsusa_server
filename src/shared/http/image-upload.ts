import type { RequestHandler } from "express";
import multer from "multer";
import type { AppError } from "./app-error.ts";

const isPng = (b: Buffer) => b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
const isJpeg = (b: Buffer) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
const isWebp = (b: Buffer) => b.length > 12 && b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP";

/** Magic-byte check; the declared MIME type and file name are client-controlled. */
export const isSupportedImage = (b: Buffer) => isPng(b) || isJpeg(b) || isWebp(b);

/** Single in-memory file in `field`; multer errors become the given 422. */
export function singleImageUpload(field: string, maxBytes: number, invalid: (message: string) => AppError): RequestHandler {
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxBytes, files: 1, fields: 0, parts: 1 },
  }).single(field);
  const maxMb = maxBytes / (1024 * 1024);
  return (req, res, next) => {
    upload(req, res, (err: unknown) => {
      if (!err) return next();
      if (err instanceof multer.MulterError) {
        return next(invalid(err.code === "LIMIT_FILE_SIZE" ? `Image must be ${maxMb} MB or smaller` : `Upload a single image in the ${field} field`));
      }
      next(err);
    });
  };
}
