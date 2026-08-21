import QuickCrypto, { type Buffer } from './native';

/** HMAC over `data` with `key`, using native OpenSSL/BoringSSL — not a JS implementation. */
export function hmac(algorithm: 'sha1' | 'sha256' | 'sha512', key: Buffer, data: Buffer): Buffer {
  return QuickCrypto.createHmac(algorithm, key).update(data).digest();
}
