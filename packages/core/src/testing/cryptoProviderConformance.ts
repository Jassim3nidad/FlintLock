import { Buffer } from 'buffer';
import { CryptoProvider } from '../crypto/CryptoProvider';
import { DecryptionError } from '../crypto/types';
import { AES_256_GCM_VECTOR } from './vectors/aesGcm.vectors';
import { PBKDF2_SHA256_VECTORS } from './vectors/pbkdf2.vectors';

/**
 * One conformance suite, run against every concrete CryptoProvider
 * implementation — native's and (once it exists) web's. This is
 * deliberately NOT duplicated per app: a `.flbx` file written on mobile
 * has to open on web, and that's only guaranteed by both
 * implementations passing the identical suite, not by two teams of
 * hand-written tests that happen to pass independently.
 *
 * `unwrapKeyHandle` lets each platform's own test file peek at a
 * KeyHandle's raw bytes for assertions this suite needs to make
 * (e.g. "derived key is 32 bytes") without packages/core ever getting
 * that ability itself — see CryptoProvider.ts.
 */
export function describeCryptoProviderConformance(
  name: string,
  makeProvider: () => CryptoProvider,
  unwrapKeyHandleBytes: (handle: ReturnType<CryptoProvider['generateDek']> extends Promise<infer T> ? T : never) => Buffer
): void {
  describe(`CryptoProvider conformance: ${name}`, () => {
    let provider: CryptoProvider;
    beforeEach(() => {
      provider = makeProvider();
    });

    it('generates a 32-byte DEK', async () => {
      const dek = await provider.generateDek();
      expect(unwrapKeyHandleBytes(dek).length).toBe(32);
    });

    it('two generated DEKs are never equal', async () => {
      const a = unwrapKeyHandleBytes(await provider.generateDek());
      const b = unwrapKeyHandleBytes(await provider.generateDek());
      expect(a.equals(b)).toBe(false);
    });

    it('wraps and unwraps a key round-trip', async () => {
      const dek = await provider.generateDek();
      const kek = await provider.deriveKek(Buffer.from('correct horse battery staple'), { kdf: 'pbkdf2', iterations: 1000, digest: 'sha256' }, Buffer.alloc(32, 7));
      const aad = Buffer.from('test-aad', 'utf8');
      const wrapped = await provider.wrapKey(dek, kek, aad);
      const unwrapped = await provider.unwrapKey(wrapped, kek, aad);
      expect(unwrapKeyHandleBytes(unwrapped).equals(unwrapKeyHandleBytes(dek))).toBe(true);
    });

    it('rejects unwrapping under the wrong AAD', async () => {
      const dek = await provider.generateDek();
      const kek = await provider.deriveKek(Buffer.from('pw'), { kdf: 'pbkdf2', iterations: 1000, digest: 'sha256' }, Buffer.alloc(32, 1));
      const wrapped = await provider.wrapKey(dek, kek, Buffer.from('aad-a'));
      await expect(provider.unwrapKey(wrapped, kek, Buffer.from('aad-b'))).rejects.toThrow(DecryptionError);
    });

    it('encrypts and decrypts plaintext round-trip', async () => {
      const key = await provider.generateDek();
      const plaintext = Buffer.from('the quick brown fox', 'utf8');
      const envelope = await provider.encrypt(plaintext, key, Buffer.from('aad'));
      const decrypted = await provider.decrypt(envelope, key, Buffer.from('aad'));
      expect(decrypted.equals(plaintext)).toBe(true);
    });

    it('rejects a tampered ciphertext', async () => {
      const key = await provider.generateDek();
      const envelope = await provider.encrypt(Buffer.from('secret'), key);
      const tampered = { ...envelope, ciphertext: Buffer.from(envelope.ciphertext) };
      tampered.ciphertext[0] = (tampered.ciphertext[0]! + 1) % 256;
      await expect(provider.decrypt(tampered, key)).rejects.toThrow(DecryptionError);
    });

    it('produces unique IVs across 100,000 encryptions', async () => {
      const key = await provider.generateDek();
      const plaintext = Buffer.from('x');
      const seen = new Set<string>();
      for (let i = 0; i < 100_000; i++) {
        const envelope = await provider.encrypt(plaintext, key);
        const ivHex = envelope.iv.toString('hex');
        expect(seen.has(ivHex)).toBe(false);
        seen.add(ivHex);
      }
    }, 60_000);

    describe('PBKDF2-HMAC-SHA-256 (RFC 7914 §11 known-answer vectors)', () => {
      for (const v of PBKDF2_SHA256_VECTORS) {
        it(v.name, async () => {
          const kek = await provider.deriveKek(Buffer.from(v.password, 'utf8'), { kdf: 'pbkdf2', iterations: v.iterations, digest: 'sha256' }, Buffer.from(v.salt, 'utf8'));
          expect(unwrapKeyHandleBytes(kek).toString('hex')).toBe(v.expectedHex);
        });
      }
    });

    it('rejects a key of the wrong length', async () => {
      const shortKey = await provider.importKey(Buffer.alloc(16, 1));
      await expect(provider.encrypt(Buffer.from('x'), shortKey)).rejects.toThrow(/32 bytes/);
    });

    describe('hkdf', () => {
      const key = Buffer.alloc(32, 0x11);
      const salt = Buffer.alloc(16, 0x22);
      const info = Buffer.from('context-info', 'utf8');

      it('returns the requested length and is deterministic', async () => {
        const a = await provider.hkdf('sha256', key, salt, info, 32);
        const b = await provider.hkdf('sha256', key, salt, info, 32);
        expect(a.length).toBe(32);
        expect(a.equals(b)).toBe(true);
      });

      it('differs when the salt, info, or key changes', async () => {
        const base = await provider.hkdf('sha256', key, salt, info, 32);
        expect(base.equals(await provider.hkdf('sha256', key, Buffer.alloc(16, 0x33), info, 32))).toBe(false);
        expect(base.equals(await provider.hkdf('sha256', key, salt, Buffer.from('other'), 32))).toBe(false);
        expect(base.equals(await provider.hkdf('sha256', Buffer.alloc(32, 0x99), salt, info, 32))).toBe(false);
      });

      it('supports sha512 and arbitrary output lengths', async () => {
        const out = await provider.hkdf('sha512', key, salt, info, 64);
        expect(out.length).toBe(64);
      });
    });

    describe('deriveKek — argon2id (structural + round-trip; not an official KAT)', () => {
      // No official RFC 9106 test vectors are wired in yet — this checks
      // determinism and salt-sensitivity of whichever argon2id backend
      // this provider uses, not conformance to a published vector.
      it('derives a 32-byte key deterministically for the same inputs', async () => {
        const params = { kdf: 'argon2id' as const, memory: 19456, passes: 2, parallelism: 1 };
        const salt = Buffer.alloc(16, 7);
        const a = unwrapKeyHandleBytes(await provider.deriveKek(Buffer.from('correct horse battery staple'), params, salt));
        const b = unwrapKeyHandleBytes(await provider.deriveKek(Buffer.from('correct horse battery staple'), params, salt));
        expect(a.length).toBe(32);
        expect(a.equals(b)).toBe(true);
      });

      it('different salts derive different keys', async () => {
        const params = { kdf: 'argon2id' as const, memory: 19456, passes: 2, parallelism: 1 };
        const a = unwrapKeyHandleBytes(await provider.deriveKek(Buffer.from('pw'), params, Buffer.alloc(16, 1)));
        const b = unwrapKeyHandleBytes(await provider.deriveKek(Buffer.from('pw'), params, Buffer.alloc(16, 2)));
        expect(a.equals(b)).toBe(false);
      });
    });

    it(`AES-256-GCM known-answer vector (${AES_256_GCM_VECTOR.name})`, async () => {
      const key = await provider.importKey(Buffer.from(AES_256_GCM_VECTOR.keyHex, 'hex'));
      const iv = Buffer.from(AES_256_GCM_VECTOR.nonceHex, 'hex');
      const aad = Buffer.from(AES_256_GCM_VECTOR.aadHex, 'hex');
      const plaintext = Buffer.from(AES_256_GCM_VECTOR.plaintextHex, 'hex');
      const resultBytes = Buffer.from(AES_256_GCM_VECTOR.resultHex, 'hex');
      const expectedCiphertext = Buffer.from(resultBytes.subarray(0, resultBytes.length - 16));
      const expectedAuthTag = Buffer.from(resultBytes.subarray(resultBytes.length - 16));

      const decrypted = await provider.decrypt({ iv, ciphertext: expectedCiphertext, authTag: expectedAuthTag }, key, aad);
      expect(decrypted.equals(plaintext)).toBe(true);
    });
  });
}
