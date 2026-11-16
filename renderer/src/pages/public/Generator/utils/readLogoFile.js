export const LOGO_ACCEPT = "image/png,image/jpeg,.png,.jpg,.jpeg";
const MAX_FILE_BYTES = 5 * 1024 * 1024;
// Logos are stored in sessionStorage as data URLs: small files are kept byte-for-byte,
// larger ones are downscaled in their own format (PNG keeps its alpha channel).
const MAX_ORIGINAL_BYTES = 1024 * 1024;
const MAX_DIMENSION = 1200;
const JPEG_QUALITY = 0.92;
const SAMPLE_SIZE = 96;

const LOGO_DATA_URL = /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/;

/** Returns `value` when it is a stored PNG/JPEG logo data URL, otherwise null. */
export const toLogoSrc = (value) =>
  typeof value === "string" && LOGO_DATA_URL.test(value) ? value : null;

const sniffImageType = async (file) => {
  const bytes = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  return null;
};

const readAsDataUrl = (blob) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Could not read the file."));
    reader.readAsDataURL(blob);
  });

const loadImage = (src) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("This image could not be opened."));
    img.src = src;
  });

/**
 * True when the image has something to show: any visible pixel on a transparent canvas,
 * or more than one flat color when the image is fully opaque.
 */
const hasVisibleContent = (img) => {
  const scale = Math.min(1, SAMPLE_SIZE / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);

  let visible = 0;
  let transparent = false;
  const min = [255, 255, 255];
  const max = [0, 0, 0];
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 250) transparent = true;
    if (data[i + 3] <= 16) continue;
    visible += 1;
    for (let c = 0; c < 3; c += 1) {
      min[c] = Math.min(min[c], data[i + c]);
      max[c] = Math.max(max[c], data[i + c]);
    }
  }

  if (visible === 0) return false;
  if (transparent) return true;
  return max.some((value, c) => value - min[c] > 8);
};

const downscale = (img, type) => {
  const scale = Math.min(1, MAX_DIMENSION / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return type === "image/png" ? canvas.toDataURL("image/png") : canvas.toDataURL("image/jpeg", JPEG_QUALITY);
};

/** Validates an uploaded PNG/JPG/JPEG logo and returns it as a data URL in its original format. */
export const readLogoFile = async (file) => {
  if (file.size > MAX_FILE_BYTES) {
    throw new Error("Logo must be 5 MB or smaller.");
  }
  const type = await sniffImageType(file);
  if (!type) {
    throw new Error("Please upload a PNG, JPG or JPEG image.");
  }

  const original = await readAsDataUrl(new Blob([file], { type }));
  const img = await loadImage(original);
  if (!img.naturalWidth || !img.naturalHeight || !hasVisibleContent(img)) {
    throw new Error("This image looks empty. Please upload a logo with visible content.");
  }

  const fitsAsIs =
    file.size <= MAX_ORIGINAL_BYTES && Math.max(img.naturalWidth, img.naturalHeight) <= MAX_DIMENSION;
  return fitsAsIs ? original : downscale(img, type);
};
