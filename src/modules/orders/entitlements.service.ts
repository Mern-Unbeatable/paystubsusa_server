import type { DocumentType } from "../../generated/prisma/enums.ts";
import { conflict, notFound } from "../../shared/http/app-error.ts";
import type { TransactionManager, Tx } from "../../shared/db/transaction.ts";
import { canAccessOrder, DOWNLOADABLE_ORDER_STATUSES } from "../../shared/policies/access.ts";
import type { GuestPrincipal, UserPrincipal } from "../../shared/types.ts";
import type { CatalogService } from "../catalog/index.ts";
import type { DocumentsService } from "../documents/index.ts";
import type { EntitlementRepository } from "./repositories/entitlement.repository.ts";

interface Deps {
  entitlements: EntitlementRepository;
  catalog: CatalogService;
  documents: DocumentsService;
  tx: TransactionManager;
}

/** Paystub credits ledger ([DECISION] 1–2): a pack or add-ons grant credits; the first is used at checkout. */
export class EntitlementsService {
  private readonly d: Deps;

  constructor(deps: Deps) {
    this.d = deps;
  }

  async grant(orderId: string, documentType: DocumentType, creditsTotal: number, tx: Tx) {
    if (creditsTotal <= 1) return null;
    return this.d.entitlements.create({ orderId, documentType, creditsTotal, creditsUsed: 1 }, tx);
  }

  listForOrder(orderId: string) {
    return this.d.entitlements.listForOrder(orderId);
  }

  /** POST /documents: spend one credit on a new paystub and queue its render. */
  async redeem(principal: UserPrincipal | GuestPrincipal, input: { entitlementId: string; templateId: string; formData: unknown }) {
    const ent = await this.d.entitlements.findWithOrder(input.entitlementId);
    if (!ent || !canAccessOrder(principal, ent.order)) throw notFound("ENTITLEMENT_NOT_FOUND", "Credits not found");
    if (!DOWNLOADABLE_ORDER_STATUSES.includes(ent.order.status)) throw conflict("ORDER_NOT_PAID", "This order isn't paid");
    if (ent.creditsUsed >= ent.creditsTotal) throw conflict("NO_CREDITS_REMAINING", "You have no paystub credits left on this order");

    await this.d.catalog.requireActiveTemplate(input.templateId, ent.documentType);
    const prepared = await this.d.documents.prepare(ent.documentType, input.formData);

    const doc = await this.d.tx.run(async (tx) => {
      if (!(await this.d.entitlements.consumeCredit(ent.id, tx))) {
        throw conflict("NO_CREDITS_REMAINING", "You have no paystub credits left on this order");
      }
      const created = await this.d.documents.create(
        { orderId: ent.orderId, templateId: input.templateId, entitlementId: ent.id, status: "queued", prepared },
        tx,
      );
      await this.d.documents.enqueueRender(created.id, tx);
      return created;
    });
    return { document: doc, creditsRemaining: ent.creditsTotal - ent.creditsUsed - 1 };
  }
}
