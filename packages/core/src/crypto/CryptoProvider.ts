import { Buffer } from 'buffer';
import { GcmEnvelope, KdfParams } from './types';

declare const keyHandleBrand: unique symbol;

/**
 * Opaque handle to structural key material (KEK, DEK, wrapping keys).
 *
 * Branded rather than `unknown` so the compiler rejects passing a plain
 * Buffer where a KeyHandle belongs — that exact confusion is how raw key
 * bytes leak into a data path. Only a concrete CryptoProvider
 * implementation may construct one (by casting at the point of
 * construction); core code can hold and pass a KeyHandle around but can
 * never read or unwrap its contents itself. See docs/CRYPTO.md.
 *
 * Native: backed by a Buffer, zeroed on disposeKey(). Web: backed by a
 * non-extractable CryptoKey, disposeKey() is a no-op — there is nothing
 * to zero because the page never held the bytes in the first place.
 */
export type KeyHandle = { readonly [keyHandleBrand]: true };

export interface CryptoProvider {
  randomBytes(length: number): Buffer;

  /**
   * Raw-bytes-in, raw-bytes-out. Deliberately NOT KeyHandle-gated: the
   * only production caller (webbridge's session-key derivation, and
   * HOTP's HMAC over a TOTP secret) operates on already-decrypted vault
   * *data*, not structural key hierarchy material — a TOTP secret is
   * inherently plaintext in JS once its record is decrypted, the same as
   * a stored password field. There is no non-extractable-key property to
   * preserve for data that was never confidential from the page's own
   * JS in the first place.
   *
   * Async on both, even though native's binding is synchronous under the
   * hood: WebCrypto's `subtle.sign` (HMAC) and `subtle.deriveBits`
   * (HKDF) are Promise-returning with no synchronous browser equivalent,
   * and a hand-rolled JS fallback would be exactly the kind of custom
   * primitive this project avoids — so the interface commits to async
   * everywhere, same reasoning as SecureStore.
   */
  hmac(algorithm: 'sha1' | 'sha256' | 'sha512', key: Buffer, data: Buffer): Promise<Buffer>;
  hkdf(digest: 'sha256' | 'sha512', key: Buffer, salt: Buffer, info: Buffer, length: number): Promise<Buffer>;

  // Structural key material — opaque KeyHandles from here down.
  deriveKek(password: Buffer, params: KdfParams, salt: Buffer): Promise<KeyHandle>;
  generateDek(): Promise<KeyHandle>;
  /** For wrapping keys sourced from an external secret (e.g. a WebAuthn PRF/largeBlob output). */
  importKey(rawBytes: Buffer): Promise<KeyHandle>;
  wrapKey(subject: KeyHandle, wrappingKey: KeyHandle, aad: Buffer): Promise<GcmEnvelope>;
  unwrapKey(envelope: GcmEnvelope, wrappingKey: KeyHandle, aad: Buffer): Promise<KeyHandle>;
  /** `key` encrypts real plaintext data (a record, a .flbx payload, ...) — this is not key-wrapping. */
  encrypt(plaintext: Buffer, key: KeyHandle, aad?: Buffer): Promise<GcmEnvelope>;
  decrypt(envelope: GcmEnvelope, key: KeyHandle, aad?: Buffer): Promise<Buffer>;
  /** Native: zeroes the underlying bytes. Web: drops the CryptoKey reference. Always call when a key's lifetime ends. */
  disposeKey(key: KeyHandle): void;
}
