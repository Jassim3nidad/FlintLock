import { Buffer, SecureStore } from '@flintlock/core';
import { vaultStorage } from './native';

function writeBytes(key: string, value: Buffer): void {
  // MMKV's buffer overload wants a real ArrayBuffer, not a Buffer/typed
  // array view, so this can't just pass `value` through. Unlike the
  // banned `.buffer` pattern (packages/core's lint rule), this slices
  // by byteOffset/byteLength first — ArrayBuffer#slice always copies,
  // so what MMKV receives is exactly value's own bytes, never a wider
  // shared pool allocation underneath a small Buffer view.
  const arrayBuffer = value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) as ArrayBuffer;
  vaultStorage.set(key, arrayBuffer);
}

/**
 * MMKV-backed SecureStore. Resolves synchronously under the hood — MMKV
 * itself has no async API — wrapped in an already-resolved Promise
 * purely to satisfy the shared SecureStore contract, which has to
 * accommodate the web IndexedDB implementation too. See SecureStore.ts.
 */
export const nativeSecureStore: SecureStore = {
  async getItem(key: string) {
    const packed = vaultStorage.getBuffer(key);
    if (packed) return Buffer.from(packed);

    // Compatibility path: before the monorepo migration, VaultStore wrote
    // the header and index directly as MMKV *strings*
    // (`vaultStorage.set(key, JSON.stringify(...))`); every SecureStore
    // key is bytes now. A vault created by that older code has a header
    // MMKV can only return via getString(), not getBuffer() — without
    // this fallback, open() would fail with a DecryptionError
    // indistinguishable from a wrong password, for a vault whose
    // password is completely correct. Detect that shape, convert it, and
    // write it back as bytes so this path is only ever taken once per
    // key — the vault is fully migrated in place, silently, on next
    // successful unlock.
    //
    // UNVERIFIED ASSUMPTION, pending the on-device upgrade pass: that
    // real MMKV's getBuffer() actually returns undefined for a
    // string-written key, the way the Jest mock does. If real MMKV
    // instead hands back that string's UTF-8 bytes, this fallback never
    // fires and the original bug reproduces on hardware with green
    // tests claiming it's fixed. The only test that can settle this is
    // installing a pre-migration build, creating a vault, then
    // installing this build over it and unlocking — see
    // docs/CRYPTO.md's device-pass checklist. Do not treat the tests
    // below as proof of the real-MMKV behavior; they only prove this
    // file's own logic once that behavior is confirmed.
    const legacyString = vaultStorage.getString(key);
    if (legacyString === undefined) return undefined;

    const migrated = Buffer.from(legacyString, 'utf8');
    console.warn(`[flintlock] Migrating legacy string-encoded storage key "${key}" to byte encoding.`);
    writeBytes(key, migrated);
    return migrated;
  },

  async setItem(key: string, value: Buffer) {
    writeBytes(key, value);
  },

  async removeItem(key) {
    vaultStorage.remove(key);
  },

  async hasItem(key) {
    return vaultStorage.contains(key);
  },
};
