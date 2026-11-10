import { z } from "zod";
import type { JobHandler } from "../shared/jobs/job-runner.ts";
import type { DocumentsService } from "../modules/documents/index.ts";

const payload = z.object({ documentId: z.uuid() });

export const renderDocumentJob =
  (documents: DocumentsService): JobHandler =>
  (raw, ctx) =>
    documents.render(payload.parse(raw).documentId, ctx);
