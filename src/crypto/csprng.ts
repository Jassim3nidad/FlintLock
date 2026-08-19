import QuickCrypto, { type Buffer } from './native';

/**
 * The only source of randomness allowed anywhere in this app's crypto path.
 * Backed by the platform CSPRNG (OpenSSL RAND_bytes via native code) —
 * never Math.random().
 */
export function randomBytes(length: number): Buffer {
  return QuickCrypto.randomBytes(length);
}

/**
 * Unbiased random integer in [0, exclusiveMax) via rejection sampling.
 * Used by the password generator so character selection has no modulo bias.
 */
export function randomInt(exclusiveMax: number): number {
  if (!Number.isInteger(exclusiveMax) || exclusiveMax <= 0) {
    throw new RangeError('exclusiveMax must be a positive integer');
  }
  if (exclusiveMax > 0x100000000) {
    throw new RangeError('exclusiveMax exceeds the 32-bit range supported by this implementation');
  }

  // Bitwise ops below are load-bearing, not stylistic: they build an
  // unbiased integer out of raw random bytes via masking.
  /* eslint-disable no-bitwise */
  const bitsNeeded = Math.ceil(Math.log2(exclusiveMax));
  const bytesNeeded = Math.ceil(bitsNeeded / 8);
  const mask = bytesNeeded === 4 ? 0xffffffff : (1 << (bytesNeeded * 8)) - 1;

  for (;;) {
    const buf = randomBytes(bytesNeeded);
    let value = 0;
    for (let i = 0; i < bytesNeeded; i++) {
      value = (value * 256 + buf[i]!) >>> 0;
    }
    // `&` coerces both operands and its result through ToInt32, so for the
    // 4-byte case (mask=0xffffffff) a set high bit would otherwise come
    // back as a negative number. Force back to unsigned after masking.
    value = (value & mask) >>> 0;
    if (value < exclusiveMax) return value;
  }
  /* eslint-enable no-bitwise */
}
