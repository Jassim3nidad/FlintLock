import QuickCrypto, { type Buffer } from './native';

/** RFC 5869 HKDF over native OpenSSL/BoringSSL. Used to derive per-session keys from a shared secret. */
export function hkdf(digest: 'sha256' | 'sha512', key: Buffer, salt: Buffer, info: Buffer, keyLengthBytes: number): Buffer {
  return QuickCrypto.hkdfSync(digest, key, salt, info, keyLengthBytes);
}
