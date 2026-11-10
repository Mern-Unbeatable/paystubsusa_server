import type { ActorType } from "../../../generated/prisma/enums.ts";
import type { Tx } from "../../../shared/db/transaction.ts";
import type { PageRequest } from "../../../shared/http/pagination.ts";

export interface AuditEntry {
  actorType: ActorType;
  actorId?: string | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  /** Must already be redacted: never formData, codes, tokens or card data. */
  metadata?: Record<string, unknown>;
  ip?: string | null;
}

export interface AuditLogRow {
  id: string;
  actorType: ActorType;
  actorId: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadata: unknown;
  ip: string | null;
  createdAt: Date;
}

export interface AuditLogFilter {
  actorId?: string;
  action?: string;
  from?: Date;
  to?: Date;
}

export interface AuditLogRepository {
  create(entry: AuditEntry, tx?: Tx): Promise<void>;
  list(filter: AuditLogFilter, page: PageRequest): Promise<{ items: AuditLogRow[]; total: number }>;
  recent(limit: number): Promise<AuditLogRow[]>;
}
