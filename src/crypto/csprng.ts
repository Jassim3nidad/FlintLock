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

/**
 * RFC 4122 v4 UUID from CSPRNG bytes (not Math.random(), unlike many
 * userland uuid-v4 implementations). Used for vault and record IDs —
 * these aren't secret, just unique, but still shouldn't be guessable.
 */
export function randomUUID(): string {
  const bytes = randomBytes(16);
  // eslint-disable-next-line no-bitwise -- set the version (4) and variant (10) bits per RFC 4122
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  // eslint-disable-next-line no-bitwise
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
