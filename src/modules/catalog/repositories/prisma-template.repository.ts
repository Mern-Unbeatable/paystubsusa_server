import { Prisma } from "../../../generated/prisma/client.ts";
import type { DocumentType } from "../../../generated/prisma/enums.ts";
import { prisma } from "../../../shared/db/prisma.ts";
import { skipTake, type PageRequest } from "../../../shared/http/pagination.ts";
import type { NewTemplate, TemplateFilter, TemplateRepository, TemplateUpdate } from "./template.repository.ts";

const withUsage = { _count: { select: { documents: true } } } as const;

const toUsage = <T extends { _count: { documents: number } }>({ _count, ...row }: T) => ({
  ...row,
  usage: { documents: _count.documents },
});

const order = [{ documentType: "asc" }, { sortOrder: "asc" }, { code: "asc" }] satisfies Prisma.DocumentTemplateOrderByWithRelationInput[];

export class PrismaTemplateRepository implements TemplateRepository {
  list({ activeOnly, documentType }: { activeOnly: boolean; documentType?: DocumentType }) {
    return prisma.documentTemplate.findMany({
      where: { documentType, ...(activeOnly ? { isActive: true } : {}) },
      orderBy: order,
    });
  }

  async search(filter: TemplateFilter, page: PageRequest) {
    const q = filter.q?.trim();
    const where: Prisma.DocumentTemplateWhereInput = {
      documentType: filter.documentType,
      isActive: filter.isActive,
      ...(q
        ? {
            OR: [
              { title: { contains: q, mode: "insensitive" } },
              { subtitle: { contains: q, mode: "insensitive" } },
              { code: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      prisma.documentTemplate.findMany({ where, include: withUsage, orderBy: order, ...skipTake(page) }),
      prisma.documentTemplate.count({ where }),
    ]);
    return { items: items.map(toUsage), total };
  }

  findById(id: string) {
    return prisma.documentTemplate.findUnique({ where: { id } });
  }

  async findWithUsage(id: string) {
    const row = await prisma.documentTemplate.findUnique({ where: { id }, include: withUsage });
    return row ? toUsage(row) : null;
  }

  async create({ variant, ...input }: NewTemplate) {
    try {
      return await prisma.documentTemplate.create({ data: { ...input, variant: variant ?? undefined, isDefault: false } });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return null;
      throw err;
    }
  }

  update(id: string, input: TemplateUpdate) {
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

  async delete(id: string) {
    try {
      await prisma.documentTemplate.delete({ where: { id } });
      return true;
    } catch (err) {
      // P2003: still referenced (FK restrict); P2025: already deleted.
      if (err instanceof Prisma.PrismaClientKnownRequestError && ["P2003", "P2025"].includes(err.code)) return false;
      throw err;
    }
  }
}
