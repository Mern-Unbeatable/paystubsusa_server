import type { ContactStatus } from "../../../generated/prisma/enums.ts";
import { dbOf, prisma } from "../../../shared/db/prisma.ts";
import type { Tx } from "../../../shared/db/transaction.ts";
import { skipTake, type PageRequest } from "../../../shared/http/pagination.ts";
import type { ContactMessageRepository } from "./contact-message.repository.ts";

const select = { id: true, name: true, email: true, subject: true, message: true, status: true, createdAt: true } as const;

export class PrismaContactMessageRepository implements ContactMessageRepository {
  create(input: { name: string; email: string; subject: string; message: string; ip: string | null }, tx?: Tx) {
    return dbOf(tx).contactMessage.create({ data: input, select });
  }

  async list(filter: { status?: ContactStatus }, page: PageRequest) {
    const where = { status: filter.status };
    const [items, total] = await Promise.all([
      prisma.contactMessage.findMany({ where, select, orderBy: [{ createdAt: "desc" }, { id: "desc" }], ...skipTake(page) }),
      prisma.contactMessage.count({ where }),
    ]);
    return { items, total };
  }

  async setStatus(id: string, status: ContactStatus) {
    const { count } = await prisma.contactMessage.updateMany({ where: { id }, data: { status } });
    return count ? prisma.contactMessage.findUnique({ where: { id }, select }) : null;
  }
}
