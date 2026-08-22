import { UnlockSession } from '../unlock/session';
import { VaultRecord } from '../storage/schema';

const DEFAULT_MAX_ENTRIES = 200;

/**
 * Bounded LRU cache of decrypted records, implementing the decrypt-on-
 * demand search approach used by VaultStore. Backed by a Map: insertion
 * order doubles as recency order, since re-inserting a key on access
 * moves it to the end.
 *
 * Automatically clears on lock — the whole point of a bounded cache here
 * is to amortize repeat decryption, not to become a second place
 * decrypted vault state can survive after the DEK is disposed.
 * "Locking wipes the DEK and all decrypted state from memory" (spec
 * §5.5) includes this cache, not just the DEK.
 */
export class RecordCache {
  private cache = new Map<string, VaultRecord>();
  private unsubscribe: () => void;

  constructor(
    private session: UnlockSession,
    private maxEntries = DEFAULT_MAX_ENTRIES
  ) {
    this.unsubscribe = session.onLock(() => this.clear());
  }

  async get(id: string): Promise<VaultRecord | undefined> {
    const cached = this.cache.get(id);
    if (cached !== undefined) {
      this.cache.delete(id);
      this.cache.set(id, cached); // bump to most-recently-used
      return cached;
    }

    const record = await this.session.vault.getRecord(id);
    if (record) this.put(id, record);
    return record;
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }

  /** Call when a session is being discarded entirely, to release the onLock subscription. */
  dispose(): void {
    this.unsubscribe();
    this.clear();
  }

  private put(id: string, record: VaultRecord): void {
    this.cache.set(id, record);
    if (this.cache.size > this.maxEntries) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) this.cache.delete(oldestKey);
    }
  }
}
