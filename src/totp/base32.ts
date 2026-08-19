import { Buffer } from '../crypto';

/** RFC 4648 §6 base32 alphabet. */
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const ALPHABET_INDEX: Record<string, number> = Object.fromEntries(
  Array.from(ALPHABET).map((c, i) => [c, i])
);

/* eslint-disable no-bitwise -- base32 is inherently a bit-packing format */
export function base32Encode(data: Buffer): string {
  if (data.length === 0) return '';

  let bits = 0;
  let value = 0;
  let output = '';

  for (const byte of data) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += ALPHABET[(value >>> (bits - 5)) & 0x1f];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += ALPHABET[(value << (5 - bits)) & 0x1f];
  }
  while (output.length % 8 !== 0) {
    output += '=';
  }
  return output;
}
/* eslint-enable no-bitwise */

/**
 * Decodes RFC 4648 base32. Input is expected already normalized (see
 * normalizeBase32Secret) — this does not tolerate lowercase, whitespace,
 * or missing padding itself.
 */
/* eslint-disable no-bitwise -- base32 is inherently a bit-packing format */
export function base32Decode(encoded: string): Buffer {
  const cleaned = encoded.replace(/[=]+$/, '');
  if (cleaned.length === 0) return Buffer.alloc(0);

  let bits = 0;
  let value = 0;
  const bytes: number[] = [];

  for (const char of cleaned) {
    const charValue = ALPHABET_INDEX[char];
    if (charValue === undefined) {
      throw new Error(`Invalid base32 character: ${char}`);
    }
    value = (value << 5) | charValue;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}
/* eslint-enable no-bitwise */

/**
 * Normalizes user- or QR-supplied base32 (TOTP secrets are routinely
 * shared without padding, with spaces every 4 characters, or lowercase)
 * into the strict form base32Decode() expects: uppercase, no whitespace
 * or hyphens, padded to a multiple of 8 with '='.
 */
export function normalizeBase32Secret(input: string): string {
  const stripped = input.toUpperCase().replace(/[\s-]+/g, '');
  const padded = stripped + '='.repeat((8 - (stripped.length % 8)) % 8);
  return padded;
}
