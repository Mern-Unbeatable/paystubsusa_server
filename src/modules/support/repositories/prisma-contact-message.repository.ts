import type { ContactStatus } from "../../../generated/prisma/enums.ts";
import { dbOf, prisma } from "../../../shared/db/prisma.ts";
import type { Tx } from "../../../shared/db/transaction.ts";
import { skipTake, type PageRequest } from "../../../shared/http/pagination.ts";
import type { ContactMessageChanges, ContactMessageRepository } from "./contact-message.repository.ts";

const select = { id: true, name: true, email: true, subject: true, message: true, status: true, createdAt: true } as const;

export class PrismaContactMessageRepository implements ContactMessageRepository {
  create(
    input: { name: string; email: string; subject: string; message: string; ip: string | null; status?: ContactStatus },
    tx?: Tx,
  ) {
    return dbOf(tx).contactMessage.create({ data: input, select });
  }

  async list(filter: { status?: ContactStatus; q?: string }, page: PageRequest) {
    const q = filter.q;
    const where = {
      status: filter.status,
      ...(q && {
        OR: [
          { name: { contains: q, mode: "insensitive" as const } },
          { email: { contains: q, mode: "insensitive" as const } },
          { subject: { contains: q, mode: "insensitive" as const } },
        ],
      }),
    };
    const [items, total] = await Promise.all([
      prisma.contactMessage.findMany({ where, select, orderBy: [{ createdAt: "desc" }, { id: "desc" }], ...skipTake(page) }),
      prisma.contactMessage.count({ where }),
    ]);
    return { items, total };
  }

  findById(id: string) {
    return prisma.contactMessage.findUnique({ where: { id }, select });
  }

  async update(id: string, changes: ContactMessageChanges, tx?: Tx) {
    const db = dbOf(tx);
    const { count } = await db.contactMessage.updateMany({ where: { id }, data: changes });
    return count ? db.contactMessage.findUnique({ where: { id }, select }) : null;
  }

  async delete(id: string) {
    const { count } = await prisma.contactMessage.deleteMany({ where: { id } });
    return count > 0;
  }
}
