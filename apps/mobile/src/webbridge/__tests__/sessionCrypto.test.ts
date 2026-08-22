jest.mock('../../crypto/native');
jest.mock('../../storage/native');
jest.mock('../../biometric/native');
jest.mock('../../clipboard/native');

import { Buffer, DecryptionError, resetPlatformForTests } from '@flintlock/core';
import { fromKeyHandle } from '../../crypto/keyHandleInterop';
import { configureNativeTestPlatform } from '../../testUtils/configureNativePlatform';
import { decryptBridgeMessage, deriveSessionKey, encryptBridgeMessage } from '../sessionCrypto';

beforeEach(() => configureNativeTestPlatform());
afterEach(() => resetPlatformForTests());

const SECRET = Buffer.alloc(32, 0x42);

describe('deriveSessionKey', () => {
  it('is deterministic for the same secret and session id', async () => {
    const a = await deriveSessionKey(SECRET, 'session-1');
    const b = await deriveSessionKey(SECRET, 'session-1');
    expect(fromKeyHandle(a).equals(fromKeyHandle(b))).toBe(true);
    expect(fromKeyHandle(a).length).toBe(32);
  });

  it('differs across session ids for the same secret', async () => {
    const a = await deriveSessionKey(SECRET, 'session-1');
    const b = await deriveSessionKey(SECRET, 'session-2');
    expect(fromKeyHandle(a).equals(fromKeyHandle(b))).toBe(false);
  });

  it('differs across secrets for the same session id', async () => {
    const a = await deriveSessionKey(SECRET, 'session-1');
    const b = await deriveSessionKey(Buffer.alloc(32, 0x99), 'session-1');
    expect(fromKeyHandle(a).equals(fromKeyHandle(b))).toBe(false);
  });
});

describe('encryptBridgeMessage / decryptBridgeMessage', () => {
  it('round-trips a message', async () => {
    const key = await deriveSessionKey(SECRET, 'session-1');
    const packed = await encryptBridgeMessage(key, JSON.stringify({ type: 'request', description: 'Login for example.com' }));
    const decoded = await decryptBridgeMessage(key, packed);
    expect(JSON.parse(decoded)).toEqual({ type: 'request', description: 'Login for example.com' });
  });

  it('fails closed under the wrong key — the "first message from a peer without the secret" case', async () => {
    const key = await deriveSessionKey(SECRET, 'session-1');
    const wrongKey = await deriveSessionKey(Buffer.alloc(32, 0x77), 'session-1');
    const packed = await encryptBridgeMessage(key, 'hello');
    await expect(decryptBridgeMessage(wrongKey, packed)).rejects.toThrow(DecryptionError);
  });

  it('fails closed on a tampered message', async () => {
    const key = await deriveSessionKey(SECRET, 'session-1');
    const packed = await encryptBridgeMessage(key, 'hello');
    packed[packed.length - 1] ^= 0xff; // eslint-disable-line no-bitwise -- flip the last ciphertext byte
    await expect(decryptBridgeMessage(key, packed)).rejects.toThrow(DecryptionError);
  });

  it('rejects a message too short to contain an IV and tag', async () => {
    const key = await deriveSessionKey(SECRET, 'session-1');
    await expect(decryptBridgeMessage(key, Buffer.alloc(10))).rejects.toThrow(/too short/i);
  });

  it('never reuses an IV across messages', async () => {
    const key = await deriveSessionKey(SECRET, 'session-1');
    const seen = new Set<string>();
    for (let i = 0; i < 500; i++) {
      const packed = await encryptBridgeMessage(key, 'x');
      const iv = packed.subarray(0, 12).toString('hex');
      expect(seen.has(iv)).toBe(false);
      seen.add(iv);
    }
  });
});
