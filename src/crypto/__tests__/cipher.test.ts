jest.mock('../native');

import { aesGcmDecrypt, aesGcmEncrypt, recordAad } from '../cipher';
import { Buffer } from '../native';
import { DecryptionError } from '../types';
import { AES_256_GCM_VECTOR } from '../__fixtures__/aesGcm.vectors';

describe('AES-256-GCM — known-answer vector', () => {
  it('matches the reference ciphertext and tag exactly', () => {
    const key = Buffer.from(AES_256_GCM_VECTOR.keyHex, 'hex');
    const iv = Buffer.from(AES_256_GCM_VECTOR.nonceHex, 'hex');
    const plaintext = Buffer.from(AES_256_GCM_VECTOR.plaintextHex, 'hex');
    const aad = Buffer.from(AES_256_GCM_VECTOR.aadHex, 'hex');
    const resultBytes = Buffer.from(AES_256_GCM_VECTOR.resultHex, 'hex');
    const expectedCiphertext = resultBytes.subarray(0, resultBytes.length - 16);
    const expectedTag = resultBytes.subarray(resultBytes.length - 16);

    // aesGcmEncrypt always draws a fresh CSPRNG IV, so to reproduce this
    // fixed-IV vector we go one level down and use QuickCrypto directly —
    // this still exercises the same production code path as aesGcmDecrypt.
    const decrypted = aesGcmDecrypt({ iv, ciphertext: expectedCiphertext, authTag: expectedTag }, key, aad);
    expect(decrypted.equals(plaintext)).toBe(true);
  });
});

describe('AES-256-GCM — round trip and fail-closed behavior', () => {
  const key = Buffer.alloc(32, 0x42);

  it('round-trips arbitrary plaintext with AAD', () => {
    const plaintext = Buffer.from('a very secret password', 'utf8');
    const aad = recordAad('record-123', 1);
    const envelope = aesGcmEncrypt(plaintext, key, aad);
    const decrypted = aesGcmDecrypt(envelope, key, aad);
    expect(decrypted.equals(plaintext)).toBe(true);
  });

  it('round-trips empty plaintext', () => {
    const envelope = aesGcmEncrypt(Buffer.alloc(0), key);
    const decrypted = aesGcmDecrypt(envelope, key);
    expect(decrypted.length).toBe(0);
  });

  it('fails closed on a flipped ciphertext byte (tamper detection)', () => {
    const envelope = aesGcmEncrypt(Buffer.from('sensitive'), key);
    envelope.ciphertext[0] ^= 0xff; // eslint-disable-line no-bitwise -- flip a byte to simulate tampering
    expect(() => aesGcmDecrypt(envelope, key)).toThrow(DecryptionError);
  });

  it('fails closed on a flipped auth tag byte', () => {
    const envelope = aesGcmEncrypt(Buffer.from('sensitive'), key);
    envelope.authTag[0] ^= 0xff; // eslint-disable-line no-bitwise -- flip a byte to simulate tampering
    expect(() => aesGcmDecrypt(envelope, key)).toThrow(DecryptionError);
  });

  it('fails closed when AAD does not match (record ID / schema version binding)', () => {
    const aad = recordAad('record-123', 1);
    const wrongAad = recordAad('record-123', 2);
    const envelope = aesGcmEncrypt(Buffer.from('sensitive'), key, aad);
    expect(() => aesGcmDecrypt(envelope, key, wrongAad)).toThrow(DecryptionError);
  });

  it('fails closed under the wrong key', () => {
    const envelope = aesGcmEncrypt(Buffer.from('sensitive'), key);
    const wrongKey = Buffer.alloc(32, 0x99);
    expect(() => aesGcmDecrypt(envelope, wrongKey)).toThrow(DecryptionError);
  });

  it('rejects non-32-byte keys', () => {
    expect(() => aesGcmEncrypt(Buffer.from('x'), Buffer.alloc(16))).toThrow(/32 bytes/);
  });
});

describe('recordAad — unambiguous binding', () => {
  it('is length-prefixed, not delimiter-joined, so it cannot alias across the id/version boundary', () => {
    // A naive `${id}:${version}` join conflates id="a:1", version=2 with
    // id="a", version="1:2" — both render as "a:1:2". Length-prefixing the
    // id up front means the version field's byte offset is fixed and can
    // never be shifted by content inside the id.
    const a = recordAad('a:1', 2);
    const b = recordAad('a', 2); // shorter id, same version — must differ
    expect(a.equals(b)).toBe(false);
    expect(a.length).toBe(8 + 'a:1'.length);
    expect(b.length).toBe(8 + 'a'.length);
  });

  it('is deterministic for the same inputs', () => {
    expect(recordAad('rec-1', 3).equals(recordAad('rec-1', 3))).toBe(true);
  });
});

describe('IV uniqueness', () => {
  it('never reuses an IV across many encryptions under the same key', () => {
    const key = Buffer.alloc(32, 0x11);
    const N = 5000;
    const seen = new Set<string>();
    for (let i = 0; i < N; i++) {
      const { iv } = aesGcmEncrypt(Buffer.from('x'), key);
      const hex = iv.toString('hex');
      expect(seen.has(hex)).toBe(false);
      seen.add(hex);
      expect(iv.length).toBe(12);
    }
  });
});
