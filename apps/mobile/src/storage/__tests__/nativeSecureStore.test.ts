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
  //
  // What these tests CANNOT prove: that real MMKV's getBuffer() actually
  // returns undefined for a string-written key the way the Jest mock
  // does. That assumption is the one thing the shim depends on that
  // only a physical device can confirm — see docs/CRYPTO.md's device
  // verification checklist. Treat everything below as "this file's
  // logic is correct given that assumption," not as proof the
  // assumption holds.

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

  // Scope of "once" here: once per key, on repeated reads of that SAME
  // key — not a global "only the first migrated key in the whole vault
  // ever warns" guarantee. There's no shared flag; the fallback is
  // purely per-key (getBuffer succeeds → skip it entirely from then
  // on). A vault with N legacy keys warns N times total, once each,
  // the first time each key is read — for the real vault, that's
  // `vault:header` (read eagerly by open()) and `vault:index` (read
  // lazily by listIndex()), so expect exactly two warnings total across
  // the device upgrade pass, not one.
  it('replaces the legacy value rather than shadowing it, and does not re-warn on a second read of the same key', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      vaultStorage.set('legacy-key', JSON.stringify({ n: 1 }));

      const first = await nativeSecureStore.getItem('legacy-key');
      expect(JSON.parse(first!.toString('utf8'))).toEqual({ n: 1 });
      expect(warnSpy).toHaveBeenCalledTimes(1);

      // The old string-typed value must be gone, not merely shadowed by
      // a co-existing bytes-typed one under the same key — MMKV only
      // ever holds one representation per key, but this asserts that
      // rather than assuming it.
      expect(vaultStorage.getString('legacy-key')).toBeUndefined();

      // Second read of the SAME key takes the bytes fast path — no
      // further migration, no further warning for THIS key.
      const second = await nativeSecureStore.getItem('legacy-key');
      expect(JSON.parse(second!.toString('utf8'))).toEqual({ n: 1 });
      expect(warnSpy).toHaveBeenCalledTimes(1);
    } finally {
      warnSpy.mockRestore();
    }
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
