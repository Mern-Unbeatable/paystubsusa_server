export { default as TemplateDocument } from "./TemplateDocument";
export { default as CompanyLogo } from "./CompanyLogo";
export { buildPaystubDocument } from "./buildPaystubDocument";
export { buildThumbnailData } from "./buildThumbnailData";
export { SAMPLE_LOGO, SAMPLE_PAYSTUB_DOCUMENT } from "./samplePaystubDocument";

export const DOCUMENT_PAGE = { width: 816, height: 1056 };

// Design width of the variant templates (01–08); previews scale it to fit.
export const VARIANT_TEMPLATE_WIDTH = 320;

const DOCUMENT_KEYS = new Set(["earnings-statement", "check-statement"]);

/** True for templates rendered as a full-page document (vs. thumbnail-only templates). */
export const hasTemplateDocument = (template) => DOCUMENT_KEYS.has(template?.document);
