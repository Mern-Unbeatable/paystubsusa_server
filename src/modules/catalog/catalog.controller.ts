import type { Request, Response } from "express";
import { notFound } from "../../shared/http/app-error.ts";
import { parse } from "../../shared/middleware/validate.ts";
import type { CatalogService } from "./catalog.service.ts";
import { quoteBody, templatePreviewParams, templatesQuery } from "./catalog.schemas.ts";

export class CatalogController {
  private readonly service: CatalogService;

  constructor(service: CatalogService) {
    this.service = service;
  }

  products = async (_req: Request, res: Response) => {
    res.setHeader("Cache-Control", "public, max-age=60");
    res.json({ data: await this.service.listProducts() });
  };

  templates = async (req: Request, res: Response) => {
    const { documentType } = parse(templatesQuery, req.query);
    res.setHeader("Cache-Control", "public, max-age=60");
    res.json({ data: await this.service.listTemplates(documentType) });
  };

  /** Public by unguessable key: <img> requests can't carry the in-memory access token. */
  templatePreview = async (req: Request, res: Response) => {
    const { file } = parse(templatePreviewParams, req.params);
    const body = await this.service.getTemplatePreview(`template-previews/${file}`);
    if (!body) throw notFound();
    res.setHeader("Content-Type", "image/webp");
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.send(body);
  };

  quote = async (req: Request, res: Response) => {
    const { items } = parse(quoteBody, req.body);
    const q = await this.service.quote(items);
    res.json({
      data: {
        lines: q.lines.map(({ productCode, name, quantity, unitAmountCents, amountCents }) => ({ productCode, name, quantity, unitAmountCents, amountCents })),
        subtotalCents: q.subtotalCents,
        taxCents: q.taxCents,
        totalCents: q.totalCents,
        currency: q.currency,
      },
    });
  };
}
