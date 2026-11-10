declare const txBrand: unique symbol;
/** Opaque transaction handle: services pass it to repositories but cannot query with it. */
export type Tx = { readonly [txBrand]: true };

export interface TransactionManager {
  run<T>(fn: (tx: Tx) => Promise<T>, options?: { timeoutMs?: number }): Promise<T>;
  /**
   * Runs `fn` only if no other instance holds the named lock (pg_try_advisory_xact_lock).
   * Returns undefined when the lock is taken. Used by scheduled tasks.
   */
  runExclusive<T>(lockName: string, fn: (tx: Tx) => Promise<T>, options?: { timeoutMs?: number }): Promise<T | undefined>;
}
