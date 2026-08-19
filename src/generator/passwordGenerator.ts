import { randomInt } from '../crypto/csprng';
import { EFF_LARGE_WORDLIST } from './wordlist';

const CHARSETS = {
  uppercase: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  lowercase: 'abcdefghijklmnopqrstuvwxyz',
  digits: '0123456789',
  symbols: '!@#$%^&*()-_=+[]{};:,.<>?/~`|',
} as const;

/** Visually similar characters across common fonts: 0/O, 1/l/I, etc. */
const AMBIGUOUS_CHARS = new Set(['0', 'O', 'o', '1', 'l', 'I', '|']);

export interface PasswordOptions {
  length: number;
  uppercase: boolean;
  lowercase: boolean;
  digits: boolean;
  symbols: boolean;
  excludeAmbiguous: boolean;
}

export interface GeneratedSecret {
  value: string;
  entropyBits: number;
}

/**
 * Generates a password by drawing each character uniformly at random from
 * the combined selected charset via randomInt() (CSPRNG rejection
 * sampling, no modulo bias — see csprng.ts).
 *
 * Deliberately does NOT guarantee "at least one character from each
 * selected category" — that common UX pattern is a biased sample: it
 * shrinks the true search space below length * log2(charsetSize), which
 * is exactly the entropy figure this function reports. Uniform sampling
 * keeps the reported entropy honest.
 */
export function generatePassword(options: PasswordOptions): GeneratedSecret {
  if (!Number.isInteger(options.length) || options.length < 8 || options.length > 128) {
    throw new RangeError('length must be an integer between 8 and 128');
  }

  const selected = (
    [
      options.uppercase && CHARSETS.uppercase,
      options.lowercase && CHARSETS.lowercase,
      options.digits && CHARSETS.digits,
      options.symbols && CHARSETS.symbols,
    ] as Array<string | false>
  ).filter((s): s is string => Boolean(s));

  if (selected.length === 0) {
    throw new Error('At least one character set must be selected');
  }

  let charset = selected.join('');
  if (options.excludeAmbiguous) {
    charset = Array.from(charset)
      .filter((c) => !AMBIGUOUS_CHARS.has(c))
      .join('');
  }
  if (charset.length === 0) {
    throw new Error('No characters remain after excluding ambiguous characters');
  }

  const chars: string[] = new Array(options.length);
  for (let i = 0; i < options.length; i++) {
    chars[i] = charset[randomInt(charset.length)]!;
  }

  return {
    value: chars.join(''),
    entropyBits: options.length * Math.log2(charset.length),
  };
}

export interface PassphraseOptions {
  wordCount: number;
  separator: string;
  capitalize: boolean;
  includeNumber: boolean;
}

/**
 * Diceware-style passphrase from the bundled offline EFF Large Wordlist
 * (7776 words, log2(7776) ≈ 12.925 bits/word). Word selection uses
 * randomInt(), not simulated dice rolls, but draws from the same
 * distribution a physical 5-die roll would.
 */
export function generatePassphrase(options: PassphraseOptions): GeneratedSecret {
  if (!Number.isInteger(options.wordCount) || options.wordCount < 1) {
    throw new RangeError('wordCount must be a positive integer');
  }

  const bitsPerWord = Math.log2(EFF_LARGE_WORDLIST.length);
  const words: string[] = new Array(options.wordCount);
  for (let i = 0; i < options.wordCount; i++) {
    const word = EFF_LARGE_WORDLIST[randomInt(EFF_LARGE_WORDLIST.length)]!;
    words[i] = options.capitalize ? word[0]!.toUpperCase() + word.slice(1) : word;
  }

  let entropyBits = options.wordCount * bitsPerWord;
  let value = words.join(options.separator);
  if (options.includeNumber) {
    const digit = randomInt(10);
    value += options.separator + digit;
    entropyBits += Math.log2(10);
  }

  return { value, entropyBits };
}
