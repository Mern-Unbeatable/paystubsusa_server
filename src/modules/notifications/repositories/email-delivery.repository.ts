import type { EmailStatus } from "../../../generated/prisma/enums.ts";
import type { Tx } from "../../../shared/db/transaction.ts";

export interface EmailDeliveryRow {
  id: string;
  toEmail: string;
  template: string;
  payload: unknown;
  status: EmailStatus;
  attempts: number;
}

export interface EmailDeliveryRepository {
  create(input: { toEmail: string; template: string; payload: Record<string, unknown>; relatedOrderId?: string | null }, tx?: Tx): Promise<string>;
  findById(id: string): Promise<EmailDeliveryRow | null>;
  /** Clears the payload: it may contain one-time codes or reset links. */
  markSent(id: string, providerMessageId: string): Promise<void>;
  markAttemptFailed(id: string, error: string, final: boolean): Promise<void>;
}
