export const FULL_PAGE_RENDERERS = new Set(["earnings-statement", "check-statement"]);

/** Catalog/admin template row -> the shape the generator components render. */
export const toGeneratorTemplate = ({
  id,
  code,
  title,
  subtitle,
  renderer,
  variant,
}) => ({
  id: code,
  // Server UUID for orders; absent on bundled fallback templates, which cannot be purchased.
  catalogId: id,
  title,
  subtitle,
  ...(variant || {}),
  ...(FULL_PAGE_RENDERERS.has(renderer) ? { document: renderer } : {}),
});
