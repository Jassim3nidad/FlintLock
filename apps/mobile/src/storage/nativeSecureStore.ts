import { Buffer, SecureStore } from '@flintlock/core';
import { vaultStorage } from './native';

/**
 * MMKV-backed SecureStore. Resolves synchronously under the hood — MMKV
 * itself has no async API — wrapped in an already-resolved Promise
 * purely to satisfy the shared SecureStore contract, which has to
 * accommodate the web IndexedDB implementation too. See SecureStore.ts.
 */
export const nativeSecureStore: SecureStore = {
  async getItem(key: string) {
    const packed = vaultStorage.getBuffer(key);
    return packed ? Buffer.from(packed) : undefined;
  },

  async setItem(key: string, value: Buffer) {
    // MMKV's buffer overload wants a real ArrayBuffer, not a Buffer/typed
    // array view, so this can't just pass `value` through. Unlike the
    // banned `.buffer` pattern (packages/core's lint rule), this slices
    // by byteOffset/byteLength first — ArrayBuffer#slice always copies,
    // so what MMKV receives is exactly value's own bytes, never a wider
    // shared pool allocation underneath a small Buffer view.
    const arrayBuffer = value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) as ArrayBuffer;
    vaultStorage.set(key, arrayBuffer);
  },

  async removeItem(key) {
    vaultStorage.remove(key);
  },

  async hasItem(key) {
    return vaultStorage.contains(key);
  },
};
