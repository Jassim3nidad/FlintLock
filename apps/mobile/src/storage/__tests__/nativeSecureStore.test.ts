jest.mock('../native');
jest.mock('../../crypto/native');
jest.mock('../../biometric/native');
jest.mock('../../clipboard/native');

import { Buffer as CoreBuffer, VaultStore } from '@flintlock/core';
import { Buffer } from '../../crypto/native';
import { vaultStorage } from '../native';
import { configureNativeTestPlatform } from '../../testUtils/configureNativePlatform';
import { nativeSecureStore } from '../nativeSecureStore';

const FAST_KDF = { kdf: 'pbkdf2' as const, iterations: 100, digest: 'sha256' as const };

beforeEach(() => {
  configureNativeTestPlatform();
  vaultStorage.clearAll();
});

describe('nativeSecureStore — MMKV round-trip', () => {
  it('round-trips exactly the bytes given, including a Buffer that is a view into a larger allocation', async () => {
    // Buffer.concat's own internal pooling means a small Buffer can be a
    // view (byteOffset > 0) into a larger shared ArrayBuffer — this is
    // exactly the case setItem()'s slice-by-offset/length has to handle
    // correctly, not silently write out the whole underlying pool.
    const pooled = Buffer.concat([Buffer.from('unrelated-prefix'), Buffer.from('payload')]);
    const value = CoreBuffer.from(pooled.subarray('unrelated-prefix'.length));

    await nativeSecureStore.setItem('k', value);
    const readBack = await nativeSecureStore.getItem('k');

    expect(readBack).toBeDefined();
    expect(readBack!.equals(value)).toBe(true);
    expect(readBack!.toString('utf8')).toBe('payload');
  });

  it('hasItem/removeItem reflect the current state', async () => {
    expect(await nativeSecureStore.hasItem('missing')).toBe(false);
    await nativeSecureStore.setItem('present', CoreBuffer.from('x'));
    expect(await nativeSecureStore.hasItem('present')).toBe(true);
    await nativeSecureStore.removeItem('present');
    expect(await nativeSecureStore.hasItem('present')).toBe(false);
  });

  it('getItem returns undefined for a key that was never set', async () => {
    expect(await nativeSecureStore.getItem('nope')).toBeUndefined();
  });
});

describe('nativeSecureStore — legacy string-encoded vault migration', () => {
  // Before the monorepo migration, VaultStore wrote the header and index
  // directly as MMKV *strings* (`vaultStorage.set(key, JSON.stringify(...))`).
  // SecureStore is byte-uniform now, so a vault written by that older
  // code has to be detected and transparently upgraded — the alternative
  // is that a completely correct password fails to open with a
  // DecryptionError indistinguishable from a wrong one. These tests
  // reproduce that exact on-disk shape rather than trusting a mock of it.

  it('getItem transparently reads a legacy string-encoded value and migrates it to bytes', async () => {
    // Reproduce the pre-migration write path directly — the old
    // writeHeader()/writeIndex() called vaultStorage.set(key, string).
    vaultStorage.set('legacy-key', JSON.stringify({ hello: 'world' }));
    expect(vaultStorage.getBuffer('legacy-key')).toBeUndefined(); // confirms this really is the legacy shape

    const value = await nativeSecureStore.getItem('legacy-key');
    expect(value).toBeDefined();
    expect(JSON.parse(value!.toString('utf8'))).toEqual({ hello: 'world' });

    // Migrated in place: a second read no longer needs the string fallback.
    expect(vaultStorage.getBuffer('legacy-key')).toBeDefined();
  });

  it('opens a vault whose header and index were written in the legacy string format, and migrates them in place', async () => {
    const password = CoreBuffer.from('correct horse battery staple');
    await VaultStore.create(password, FAST_KDF);

    // Downgrade the just-created header and index to the legacy
    // string-encoded shape, simulating a vault created by the
    // pre-migration app and never touched since.
    for (const key of ['vault:header', 'vault:index']) {
      const bytes = vaultStorage.getBuffer(key)!;
      const json = Buffer.from(bytes).toString('utf8');
      vaultStorage.set(key, json);
      expect(vaultStorage.getBuffer(key)).toBeUndefined(); // really legacy-shaped now
    }

    // The point of this test: opening with the *correct* password must
    // succeed — not fail with a DecryptionError indistinguishable from a
    // wrong password, which is what happened before this fix.
    const opened = await VaultStore.open(password);
    expect(opened.isUnlocked()).toBe(true);

    // open() only reads the header eagerly; the header key is migrated
    // to bytes as a side effect of that read.
    expect(vaultStorage.getBuffer('vault:header')).toBeDefined();

    // The index is read lazily, on first actual use — listIndex() here
    // must also succeed against the legacy-encoded index, and migrate it.
    expect(vaultStorage.getBuffer('vault:index')).toBeUndefined(); // not touched yet
    await expect(opened.listIndex()).resolves.toEqual([]);
    expect(vaultStorage.getBuffer('vault:index')).toBeDefined();
  });
});
