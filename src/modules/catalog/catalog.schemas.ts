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

export const quoteBody = z.object({ items: orderItemsField });
