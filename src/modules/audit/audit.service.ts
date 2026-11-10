import type { Tx } from "../../shared/db/transaction.ts";
import type { Principal } from "../../shared/types.ts";
import { toPage, type PageRequest } from "../../shared/http/pagination.ts";
import type { AuditEntry, AuditLogFilter, AuditLogRepository } from "./repositories/audit-log.repository.ts";

export const actorOf = (p: Principal): Pick<AuditEntry, "actorType" | "actorId"> =>
  p.type === "user"
    ? { actorType: p.role, actorId: p.userId }
    : p.type === "guest"
      ? { actorType: "guest", actorId: null }
      : { actorType: "system", actorId: null };

export class AuditService {
  private readonly repo: AuditLogRepository;

  constructor(repo: AuditLogRepository) {
    this.repo = repo;
  }

  record(entry: AuditEntry, tx?: Tx) {
    return this.repo.create(entry, tx);
  }

  async list(filter: AuditLogFilter, page: PageRequest) {
    const { items, total } = await this.repo.list(filter, page);
    return toPage(items, total, page);
  }

  recent(limit: number) {
    return this.repo.recent(limit);
  }
}
