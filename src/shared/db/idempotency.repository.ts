export interface StoredResponse {
  status: number;
  body: unknown;
}

export interface IdempotencyRecord {
  key: string;
  requestHash: string;
  response: StoredResponse | null;
  createdAt: Date;
  expiresAt: Date;
}

export interface IdempotencyRepository {
  /** Inserts an in-flight record; false when the key already exists. */
  reserve(key: string, scope: string, requestHash: string, expiresAt: Date): Promise<boolean>;
  find(key: string): Promise<IdempotencyRecord | null>;
  complete(key: string, response: StoredResponse): Promise<void>;
  release(key: string): Promise<void>;
  deleteExpired(now: Date): Promise<number>;
  /**
   * Drops in-flight rows with no stored response. Used on process boot: any prior
   * in-flight request died with the old process and would otherwise 409 for ABANDONED_MS.
   */
  releaseInFlight(): Promise<number>;
}
