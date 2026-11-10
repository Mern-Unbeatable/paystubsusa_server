import type { Tx } from "../../../shared/db/transaction.ts";

export interface WebhookEventRepository {
  /** Records the event; returns false if it was already processed (duplicate delivery). */
  begin(id: string, type: string, payload: unknown): Promise<boolean>;
  markProcessed(id: string, tx: Tx): Promise<void>;
  markError(id: string, error: string): Promise<void>;
  clearPayloadsBefore(before: Date): Promise<number>;
}
