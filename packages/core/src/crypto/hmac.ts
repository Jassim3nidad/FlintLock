import { Buffer } from 'buffer';
import { getCryptoProvider } from '../platform';

/** HMAC over `data` with `key`, via the platform's native binding — not a JS implementation. */
export function hmac(algorithm: 'sha1' | 'sha256' | 'sha512', key: Buffer, data: Buffer): Promise<Buffer> {
  return getCryptoProvider().hmac(algorithm, key, data);
}
