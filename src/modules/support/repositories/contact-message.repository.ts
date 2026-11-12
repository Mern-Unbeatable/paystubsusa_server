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

export type ContactMessageChanges = Partial<Pick<ContactMessageRow, "name" | "email" | "subject" | "message" | "status">>;

export interface ContactMessageRepository {
  create(
    input: { name: string; email: string; subject: string; message: string; ip: string | null; status?: ContactStatus },
    tx?: Tx,
  ): Promise<ContactMessageRow>;
  list(filter: { status?: ContactStatus; q?: string }, page: PageRequest): Promise<{ items: ContactMessageRow[]; total: number }>;
  /** null when the message doesn't exist. */
  update(id: string, changes: ContactMessageChanges): Promise<ContactMessageRow | null>;
  /** false when the message doesn't exist. */
  delete(id: string): Promise<boolean>;
}
