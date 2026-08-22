import { Buffer } from 'buffer';
import { SecureStore } from '../storage/SecureStore';

/** In-memory SecureStore for tests — resolves asynchronously (via microtask) like both real implementations, backed by a plain Map. */
export function createInMemorySecureStore(): SecureStore {
  const store = new Map<string, Buffer>();
  return {
    async getItem(key) {
      const value = store.get(key);
      return value ? Buffer.from(value) : undefined;
    },
    async setItem(key, value) {
      store.set(key, Buffer.from(value));
    },
    async removeItem(key) {
      store.delete(key);
    },
    async hasItem(key) {
      return store.has(key);
    },
  };
}
