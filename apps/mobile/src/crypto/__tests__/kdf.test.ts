jest.mock('../native');

import { deriveKek } from '../kdf';
import { Buffer } from '../native';
import { PBKDF2_SHA256_VECTORS } from '../__fixtures__/pbkdf2.vectors';

describe('deriveKek — pbkdf2 (RFC 7914 §11 known-answer vectors)', () => {
  for (const v of PBKDF2_SHA256_VECTORS) {
    it(v.name, async () => {
      const kek = await deriveKek(
        Buffer.from(v.password, 'utf8'),
        { kdf: 'pbkdf2', iterations: v.iterations, digest: 'sha256' },
        Buffer.from(v.salt, 'utf8')
      );
      expect(kek.toString('hex')).toBe(v.expectedHex);
      expect(kek.length).toBe(32);
    });
  }

  it('different passwords derive different keys', async () => {
    const params = { kdf: 'pbkdf2' as const, iterations: 1000, digest: 'sha256' as const };
    const salt = Buffer.from('fixed-salt-000000000000000000000');
    const a = await deriveKek(Buffer.from('password-a'), params, salt);
    const b = await deriveKek(Buffer.from('password-b'), params, salt);
    expect(a.equals(b)).toBe(false);
  });
});

describe('deriveKek — argon2id (structural + round-trip; see note)', () => {
  // NOTE: this exercises the test double (hash-wasm's WASM Argon2id), which
  // validates our parameter marshalling but NOT react-native-quick-crypto's
  // native OpenSSL Argon2id binding — that can only run on-device/simulator.
  // Unverified against RFC 9106's official Argon2id test vectors; flagged
  // in the phase report.
  it('derives a 32-byte key deterministically for the same inputs', async () => {
    const params = { kdf: 'argon2id' as const, memory: 19456, passes: 2, parallelism: 1 };
    const salt = Buffer.alloc(16, 7);
    const a = await deriveKek(Buffer.from('correct horse battery staple'), params, salt);
    const b = await deriveKek(Buffer.from('correct horse battery staple'), params, salt);
    expect(a.length).toBe(32);
    expect(a.equals(b)).toBe(true);
  });

  it('different salts derive different keys', async () => {
    const params = { kdf: 'argon2id' as const, memory: 19456, passes: 2, parallelism: 1 };
    const a = await deriveKek(Buffer.from('pw'), params, Buffer.alloc(16, 1));
    const b = await deriveKek(Buffer.from('pw'), params, Buffer.alloc(16, 2));
    expect(a.equals(b)).toBe(false);
  });
});
