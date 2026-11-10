import type { ContactStatus } from "../../../generated/prisma/enums.ts";
import type { Tx } from "../../../shared/db/transaction.ts";
import type { PageRequest } from "../../../shared/http/pagination.ts";

export interface ContactMessageRow {
  id: string;
  name: string;
  email: string;
  subject: string;
  message: string;
  status: ContactStatus;
  createdAt: Date;
}

export interface ContactMessageRepository {
  create(input: { name: string; email: string; subject: string; message: string; ip: string | null }, tx?: Tx): Promise<ContactMessageRow>;
  list(filter: { status?: ContactStatus }, page: PageRequest): Promise<{ items: ContactMessageRow[]; total: number }>;
  /** null when the message doesn't exist. */
  setStatus(id: string, status: ContactStatus): Promise<ContactMessageRow | null>;
}
