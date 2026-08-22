import { Buffer } from 'buffer';
import { getCryptoProvider } from '../platform';

/** RFC 5869 HKDF via the platform's native binding. Used to derive per-session keys from a shared secret. */
export function hkdf(digest: 'sha256' | 'sha512', key: Buffer, salt: Buffer, info: Buffer, keyLengthBytes: number): Promise<Buffer> {
  return getCryptoProvider().hkdf(digest, key, salt, info, keyLengthBytes);
}
