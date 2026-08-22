import { Buffer } from 'buffer';

/**
 * Vault persistence, byte-KV shaped. Async everywhere — including on
 * native, where the concrete MMKV-backed implementation resolves
 * synchronously in practice — because the web implementation (IndexedDB)
 * cannot be synchronous, and a single shared VaultStore can't commit to
 * two different call-site shapes depending on platform.
 *
 * Why this had to be async rather than keeping a sync API and flushing
 * writes to IndexedDB behind the scenes: a sync-looking API backed by an
 * async write means a failed write is invisible to the caller that
 * thinks it already succeeded. Silent write loss in a password manager
 * is unacceptable, so every call site pays the await instead.
 */
export interface SecureStore {
  getItem(key: string): Promise<Buffer | undefined>;
  setItem(key: string, value: Buffer): Promise<void>;
  removeItem(key: string): Promise<void>;
  hasItem(key: string): Promise<boolean>;
}
