import { Buffer } from 'buffer';

/** Fixed by the crypto spec (docs/CRYPTO.md) — not user-configurable. */
export const KEY_LENGTH_BYTES = 32; // 256-bit KEK/DEK
export const SALT_LENGTH_BYTES = 32;
export const GCM_IV_LENGTH_BYTES = 12; // 96-bit, per NIST SP 800-38D
export const GCM_AUTH_TAG_LENGTH_BYTES = 16; // 128-bit

export const PBKDF2_DIGEST = 'sha256';
export const PBKDF2_DEFAULT_ITERATIONS = 310_000;

export type KdfAlgorithm = 'pbkdf2' | 'argon2id';

export interface Pbkdf2Params {
  kdf: 'pbkdf2';
  iterations: number;
  digest: typeof PBKDF2_DIGEST;
}

export interface Argon2idParams {
  kdf: 'argon2id';
  /** RFC 9106 "memoryCost" in KiB. */
  memory: number;
  /** RFC 9106 "timeCost" — number of passes. */
  passes: number;
  parallelism: number;
}

export type KdfParams = Pbkdf2Params | Argon2idParams;

/** Ciphertext + everything needed to authenticate and decrypt it, nothing more. */
export interface GcmEnvelope {
  iv: Buffer;
  ciphertext: Buffer;
  authTag: Buffer;
}

export type WrappedKey = GcmEnvelope;

/** Thrown on GCM auth-tag mismatch or any other decryption failure. Fail closed. */
export class DecryptionError extends Error {
  constructor(message = 'Decryption failed: ciphertext or authentication tag is invalid') {
    super(message);
    this.name = 'DecryptionError';
  }
}
