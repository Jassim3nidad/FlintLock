jest.mock('../../crypto/native');

import { Buffer, DecryptionError } from '../../crypto';
import { decryptBridgeMessage, deriveSessionKey, encryptBridgeMessage } from '../sessionCrypto';

const SECRET = Buffer.alloc(32, 0x42);

describe('deriveSessionKey', () => {
  it('is deterministic for the same secret and session id', () => {
    const a = deriveSessionKey(SECRET, 'session-1');
    const b = deriveSessionKey(SECRET, 'session-1');
    expect(a.equals(b)).toBe(true);
    expect(a.length).toBe(32);
  });

  it('differs across session ids for the same secret', () => {
    const a = deriveSessionKey(SECRET, 'session-1');
    const b = deriveSessionKey(SECRET, 'session-2');
    expect(a.equals(b)).toBe(false);
  });

  it('differs across secrets for the same session id', () => {
    const a = deriveSessionKey(SECRET, 'session-1');
    const b = deriveSessionKey(Buffer.alloc(32, 0x99), 'session-1');
    expect(a.equals(b)).toBe(false);
  });
});

describe('encryptBridgeMessage / decryptBridgeMessage', () => {
  const key = deriveSessionKey(SECRET, 'session-1');

  it('round-trips a message', () => {
    const packed = encryptBridgeMessage(key, JSON.stringify({ type: 'request', description: 'Login for example.com' }));
    const decoded = decryptBridgeMessage(key, packed);
    expect(JSON.parse(decoded)).toEqual({ type: 'request', description: 'Login for example.com' });
  });

  it('fails closed under the wrong key — the "first message from a peer without the secret" case', () => {
    const wrongKey = deriveSessionKey(Buffer.alloc(32, 0x77), 'session-1');
    const packed = encryptBridgeMessage(key, 'hello');
    expect(() => decryptBridgeMessage(wrongKey, packed)).toThrow(DecryptionError);
  });

  it('fails closed on a tampered message', () => {
    const packed = encryptBridgeMessage(key, 'hello');
    packed[packed.length - 1] ^= 0xff; // eslint-disable-line no-bitwise -- flip the last ciphertext byte
    expect(() => decryptBridgeMessage(key, packed)).toThrow(DecryptionError);
  });

  it('rejects a message too short to contain an IV and tag', () => {
    expect(() => decryptBridgeMessage(key, Buffer.alloc(10))).toThrow(/too short/i);
  });

  it('never reuses an IV across messages', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 500; i++) {
      const packed = encryptBridgeMessage(key, 'x');
      const iv = packed.subarray(0, 12).toString('hex');
      expect(seen.has(iv)).toBe(false);
      seen.add(iv);
    }
  });
});
