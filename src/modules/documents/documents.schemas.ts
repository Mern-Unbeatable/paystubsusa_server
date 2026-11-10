import { z } from "zod";
import { paginationQuery, sortQuery } from "../../shared/http/pagination.ts";
import { documentTypeEnum } from "../catalog/index.ts";

export const documentIdParams = z.object({ documentId: z.uuid() });

export const listDocumentsQuery = z.object({
  ...paginationQuery,
  type: documentTypeEnum.optional(),
  q: z.string().trim().max(100).optional(),
  sort: sortQuery(["createdAt", "title"], "-createdAt"),
});
