jest.mock('../../crypto/native');

import { Buffer } from '../../crypto';
import { base32Decode, base32Encode, normalizeBase32Secret } from '../base32';

// RFC 4648 §10 official test vectors.
const RFC_4648_VECTORS: [string, string][] = [
  ['', ''],
  ['f', 'MY======'],
  ['fo', 'MZXQ===='],
  ['foo', 'MZXW6==='],
  ['foob', 'MZXW6YQ='],
  ['fooba', 'MZXW6YTB'],
  ['foobar', 'MZXW6YTBOI======'],
];

describe('base32Encode — RFC 4648 §10 known-answer vectors', () => {
  for (const [input, expected] of RFC_4648_VECTORS) {
    it(`encode(${JSON.stringify(input)}) -> ${JSON.stringify(expected)}`, () => {
      expect(base32Encode(Buffer.from(input, 'utf8'))).toBe(expected);
    });
  }
});

describe('base32Decode — RFC 4648 §10 known-answer vectors', () => {
  for (const [expected, input] of RFC_4648_VECTORS) {
    it(`decode(${JSON.stringify(input)}) -> ${JSON.stringify(expected)}`, () => {
      expect(base32Decode(input).toString('utf8')).toBe(expected);
    });
  }
});

describe('base32 round-trip', () => {
  it('round-trips arbitrary binary data', () => {
    const original = Buffer.from([0, 1, 2, 254, 255, 128, 17, 33, 200]);
    expect(base32Decode(base32Encode(original)).equals(original)).toBe(true);
  });
});

describe('normalizeBase32Secret', () => {
  it('uppercases lowercase input', () => {
    expect(normalizeBase32Secret('mzxw6ytb')).toBe('MZXW6YTB');
  });

  it('strips spaces and hyphens (common in QR/manual-entry secrets)', () => {
    expect(normalizeBase32Secret('MZXW 6YTB')).toBe('MZXW6YTB');
    expect(normalizeBase32Secret('MZXW-6YTB')).toBe('MZXW6YTB');
    expect(normalizeBase32Secret('mzxw 6ytb-oi')).toBe(normalizeBase32Secret('MZXW6YTBOI'));
  });

  it('pads to a multiple of 8 when padding is missing, as real-world secrets often omit it', () => {
    expect(normalizeBase32Secret('MZXW6YTB')).toBe('MZXW6YTB'); // already a multiple of 8
    expect(normalizeBase32Secret('MZXW6YTBOI')).toBe('MZXW6YTBOI======');
  });

  it('normalized output decodes to the same bytes as the original padded form', () => {
    const messy = 'mzxw 6ytb-oi';
    expect(base32Decode(normalizeBase32Secret(messy)).toString('utf8')).toBe('foobar');
  });
});
