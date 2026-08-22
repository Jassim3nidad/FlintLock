jest.mock('../native');
jest.mock('../../crypto/native');

import { Buffer as CoreBuffer } from '@flintlock/core';
import { Buffer } from '../../crypto/native';
import { vaultStorage } from '../native';
import { nativeSecureStore } from '../nativeSecureStore';

beforeEach(() => {
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
