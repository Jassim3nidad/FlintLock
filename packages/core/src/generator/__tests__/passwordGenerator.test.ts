import { configureTestPlatform, resetPlatformForTests } from '../../testing/configureTestPlatform';
import { generatePassphrase, generatePassword } from '../passwordGenerator';
import { EFF_LARGE_WORDLIST } from '../wordlist';

beforeEach(() => configureTestPlatform());
afterEach(() => resetPlatformForTests());

describe('generatePassword', () => {
  const allCharsets = { uppercase: true, lowercase: true, digits: true, symbols: true, excludeAmbiguous: false };

  it('produces a string of the requested length', () => {
    const { value } = generatePassword({ ...allCharsets, length: 20 });
    expect(value).toHaveLength(20);
  });

  it('rejects lengths outside [8, 128]', () => {
    expect(() => generatePassword({ ...allCharsets, length: 7 })).toThrow(RangeError);
    expect(() => generatePassword({ ...allCharsets, length: 129 })).toThrow(RangeError);
    expect(() => generatePassword({ ...allCharsets, length: 8.5 })).toThrow(RangeError);
  });

  it('rejects when no character set is selected', () => {
    expect(() =>
      generatePassword({ length: 12, uppercase: false, lowercase: false, digits: false, symbols: false, excludeAmbiguous: false })
    ).toThrow(/at least one/i);
  });

  it('only uses characters from the selected sets', () => {
    const { value } = generatePassword({
      length: 128,
      uppercase: false,
      lowercase: true,
      digits: true,
      symbols: false,
      excludeAmbiguous: false,
    });
    expect(value).toMatch(/^[a-z0-9]+$/);
  });

  it('excludeAmbiguous removes visually similar characters', () => {
    const { value } = generatePassword({
      length: 128,
      uppercase: true,
      lowercase: true,
      digits: true,
      symbols: false,
      excludeAmbiguous: true,
    });
    expect(value).not.toMatch(/[0O o1lI|]/);
  });

  it('reports entropy as length * log2(charsetSize), matching the actual charset used', () => {
    const { entropyBits } = generatePassword({
      length: 16,
      uppercase: true,
      lowercase: true,
      digits: false,
      symbols: false,
      excludeAmbiguous: false,
    });
    // 26 uppercase + 26 lowercase = 52 symbols
    expect(entropyBits).toBeCloseTo(16 * Math.log2(52), 10);
  });

  it('entropy accounts for excludeAmbiguous shrinking the charset', () => {
    const withAmbiguous = generatePassword({ length: 10, uppercase: false, lowercase: true, digits: true, symbols: false, excludeAmbiguous: false });
    const withoutAmbiguous = generatePassword({ length: 10, uppercase: false, lowercase: true, digits: true, symbols: false, excludeAmbiguous: true });
    expect(withoutAmbiguous.entropyBits).toBeLessThan(withAmbiguous.entropyBits);
  });

  it('draws characters roughly uniformly over many samples (no obvious bias)', () => {
    const seenChars = new Set<string>();
    for (let i = 0; i < 20; i++) {
      const { value } = generatePassword({ length: 128, uppercase: false, lowercase: true, digits: false, symbols: false, excludeAmbiguous: false });
      for (const ch of value) seenChars.add(ch);
    }
    // 26 letters, 20 * 128 = 2560 draws — should hit nearly all of them.
    expect(seenChars.size).toBeGreaterThan(20);
  });
});

describe('generatePassphrase', () => {
  it('produces the requested number of words joined by the separator', () => {
    const { value } = generatePassphrase({ wordCount: 5, separator: '-', capitalize: false, includeNumber: false });
    expect(value.split('-')).toHaveLength(5);
  });

  it('every word comes from the bundled EFF wordlist', () => {
    const { value } = generatePassphrase({ wordCount: 6, separator: '-', capitalize: false, includeNumber: false });
    const wordSet = new Set(EFF_LARGE_WORDLIST);
    for (const word of value.split('-')) {
      expect(wordSet.has(word)).toBe(true);
    }
  });

  it('capitalizes each word when requested', () => {
    const { value } = generatePassphrase({ wordCount: 4, separator: '-', capitalize: true, includeNumber: false });
    for (const word of value.split('-')) {
      expect(word[0]).toBe(word[0]!.toUpperCase());
    }
  });

  it('reports entropy as wordCount * log2(7776)', () => {
    const { entropyBits } = generatePassphrase({ wordCount: 6, separator: '-', capitalize: false, includeNumber: false });
    expect(entropyBits).toBeCloseTo(6 * Math.log2(7776), 10);
  });

  it('includeNumber appends a digit and adds log2(10) bits of entropy', () => {
    const withoutNumber = generatePassphrase({ wordCount: 4, separator: '-', capitalize: false, includeNumber: false });
    const withNumber = generatePassphrase({ wordCount: 4, separator: '-', capitalize: false, includeNumber: true });
    expect(withNumber.entropyBits).toBeCloseTo(withoutNumber.entropyBits + Math.log2(10), 10);
    expect(withNumber.value.split('-')).toHaveLength(5);
    expect(withNumber.value.split('-').at(-1)).toMatch(/^\d$/);
  });

  it('rejects a non-positive word count', () => {
    expect(() => generatePassphrase({ wordCount: 0, separator: '-', capitalize: false, includeNumber: false })).toThrow(RangeError);
  });
});

describe('EFF_LARGE_WORDLIST integrity', () => {
  it('has exactly 7776 unique words (6^5, the standard 5-die diceware size)', () => {
    expect(EFF_LARGE_WORDLIST).toHaveLength(7776);
    expect(new Set(EFF_LARGE_WORDLIST).size).toBe(7776);
  });
});
