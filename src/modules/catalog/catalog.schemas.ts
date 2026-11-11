import { z } from "zod";

export const documentTypeEnum = z.enum(["paystub", "w2", "nec1099", "direct_deposit"]);

export const orderItemsField = z
  .array(
    z.object({
      productCode: z.string().min(1).max(64),
      quantity: z.number().int().min(1).max(100),
    }),
  )
  .min(1)
  .max(5);

export const templatesQuery = z.object({ documentType: documentTypeEnum.optional() });

/** Renderer keys the offline template bundle implements, per document type. */
export const TEMPLATE_RENDERERS = {
  paystub: ["variant", "earnings-statement", "check-statement"],
  w2: ["w2"],
  nec1099: ["nec1099"],
  direct_deposit: ["direct-deposit"],
} as const satisfies Record<z.infer<typeof documentTypeEnum>, readonly string[]>;

/** Full-page layouts that take no style variant. */
export const VARIANTLESS_RENDERERS: ReadonlySet<string> = new Set(["earnings-statement", "check-statement"]);

/** Renderer whose output the optional `variant.theme` restyles. */
export const THEMEABLE_RENDERER = "variant";

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a 6-digit HEX colour like #1E60F2");

export const templateThemeField = z
  .object({
    primaryColor: hexColor,
    accentColor: hexColor,
    tintColor: hexColor,
    backgroundColor: hexColor,
    headingColor: hexColor,
    textColor: hexColor,
    borderColor: hexColor,
    fontFamily: z.enum(["sans", "serif", "mono"]),
    fontScale: z.number().min(0.8).max(1.3),
    lineHeight: z.number().min(1).max(1.8),
    letterSpacing: z.number().min(-0.05).max(0.2),
    pagePadding: z.number().int().min(0).max(48),
    sectionSpacing: z.number().int().min(0).max(32),
    borderRadius: z.number().int().min(0).max(16),
  })
  .strict();

export const templateVariantField = z
  .object({
    headerVariant: z.enum(["dark-full", "blue-full", "minimal-blue-line", "minimal-dark-line", "boxed", "split-dark", "split-blue"]),
    netPayVariant: z.enum(["dark", "blue"]),
    tableVariant: z.enum(["light-blue", "solid-blue", "solid-dark", "minimal-gray"]),
    theme: templateThemeField.optional(),
  })
  .strict();

export type TemplateVariant = z.infer<typeof templateVariantField>;

export const templatePreviewParams = z.object({
  file: z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.webp$/),
});

export const quoteBody = z.object({ items: orderItemsField });
