import { Buffer, hmac } from '../crypto';

export type OtpAlgorithm = 'SHA1' | 'SHA256' | 'SHA512';
export type OtpDigits = 6 | 8;

const ALGORITHM_MAP: Record<OtpAlgorithm, 'sha1' | 'sha256' | 'sha512'> = {
  SHA1: 'sha1',
  SHA256: 'sha256',
  SHA512: 'sha512',
};

export interface HotpParams {
  algorithm: OtpAlgorithm;
  digits: OtpDigits;
}

/**
 * RFC 4226 HOTP. `counter` must fit in 53 bits (Number.MAX_SAFE_INTEGER) —
 * plenty for any realistic counter value; RFC 4226 itself specifies an
 * 8-byte field but no implementation reaches anywhere near 2^53 events.
 */
export function generateHotp(secret: Buffer, counter: number, params: HotpParams): string {
  if (!Number.isInteger(counter) || counter < 0 || !Number.isSafeInteger(counter)) {
    throw new RangeError('counter must be a non-negative safe integer');
  }

  const counterBytes = Buffer.alloc(8);
  // Split into two 32-bit halves — bitwise ops on the full 53-bit value
  // would truncate through ToInt32. High 32 bits are 0 for any counter
  // that fits in a JS safe integer used practically here (up to 2^53).
  const high = Math.floor(counter / 0x100000000);
  const low = counter >>> 0; // eslint-disable-line no-bitwise -- low 32 bits, safe since counter < 2^53 and high is handled separately
  counterBytes.writeUInt32BE(high, 0);
  counterBytes.writeUInt32BE(low, 4);

  const digest = hmac(ALGORITHM_MAP[params.algorithm], secret, counterBytes);

  // eslint-disable-next-line no-bitwise -- RFC 4226 §5.3 dynamic truncation, bit ops are the spec
  const offset = digest[digest.length - 1]! & 0x0f;
  const binCode =
    // eslint-disable-next-line no-bitwise
    ((digest[offset]! & 0x7f) << 24) |
    // eslint-disable-next-line no-bitwise
    ((digest[offset + 1]! & 0xff) << 16) |
    // eslint-disable-next-line no-bitwise
    ((digest[offset + 2]! & 0xff) << 8) |
    // eslint-disable-next-line no-bitwise
    (digest[offset + 3]! & 0xff);

  const otp = (binCode % 10 ** params.digits).toString().padStart(params.digits, '0');
  return otp;
}
