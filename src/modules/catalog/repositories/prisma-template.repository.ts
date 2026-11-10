import type { DocumentType } from "../../../generated/prisma/enums.ts";
import { prisma } from "../../../shared/db/prisma.ts";
import type { TemplateRepository } from "./template.repository.ts";

export class PrismaTemplateRepository implements TemplateRepository {
  list({ activeOnly, documentType }: { activeOnly: boolean; documentType?: DocumentType }) {
    return prisma.documentTemplate.findMany({
      where: { documentType, ...(activeOnly ? { isActive: true } : {}) },
      orderBy: [{ documentType: "asc" }, { sortOrder: "asc" }, { code: "asc" }],
    });
  }

  findById(id: string) {
    return prisma.documentTemplate.findUnique({ where: { id } });
  }

  update(id: string, input: { title?: string; subtitle?: string | null; isActive?: boolean; sortOrder?: number }) {
    return prisma.documentTemplate.update({ where: { id }, data: input });
  }

  setDefault(id: string) {
    return prisma.$transaction(async (db) => {
      const target = await db.documentTemplate.findUniqueOrThrow({ where: { id } });
      // Row locks on every template of this type serialize concurrent "set default" calls.
      await db.$queryRaw`SELECT id FROM document_templates WHERE document_type = ${target.documentType}::"DocumentType" FOR UPDATE`;
      await db.documentTemplate.updateMany({ where: { documentType: target.documentType, isDefault: true }, data: { isDefault: false } });
      return db.documentTemplate.update({ where: { id }, data: { isDefault: true } });
    });
  }
}
