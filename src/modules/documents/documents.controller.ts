import type { Request, Response } from "express";
import { parse } from "../../shared/middleware/validate.ts";
import { ownerPrincipal } from "../../shared/middleware/require-role.ts";
import { requestContext } from "../auth/index.ts";
import type { DocumentsService } from "./documents.service.ts";
import { documentIdParams, listDocumentsQuery } from "./documents.schemas.ts";

export class DocumentsController {
  private readonly service: DocumentsService;

  constructor(service: DocumentsService) {
    this.service = service;
  }

  list = async (req: Request, res: Response) => {
    const { page, pageSize, type, q, sort } = parse(listDocumentsQuery, req.query);
    res.json(await this.service.list(ownerPrincipal(req), { type, q, sort }, { page, pageSize }));
  };

  get = async (req: Request, res: Response) => {
    const { documentId } = parse(documentIdParams, req.params);
    res.json({ data: await this.service.get(ownerPrincipal(req), documentId) });
  };

  download = async (req: Request, res: Response) => {
    const { documentId } = parse(documentIdParams, req.params);
    res.json({ data: await this.service.download(ownerPrincipal(req), documentId, requestContext(req)) });
  };
}
