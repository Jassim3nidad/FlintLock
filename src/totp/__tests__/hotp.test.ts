jest.mock('../../crypto/native');

import { Buffer } from '../../crypto';
import { generateHotp } from '../hotp';
import { HOTP_SECRET_HEX, HOTP_VECTORS } from '../__fixtures__/hotp.vectors';

describe('generateHotp — RFC 4226 Appendix D known-answer vectors', () => {
  const secret = Buffer.from(HOTP_SECRET_HEX, 'hex');

  for (const { counter, expectedCode } of HOTP_VECTORS) {
    it(`counter=${counter} -> ${expectedCode}`, () => {
      expect(generateHotp(secret, counter, { algorithm: 'SHA1', digits: 6 })).toBe(expectedCode);
    });
  }
});

describe('generateHotp — invariants', () => {
  const secret = Buffer.from(HOTP_SECRET_HEX, 'hex');

  it('rejects negative or non-integer counters', () => {
    expect(() => generateHotp(secret, -1, { algorithm: 'SHA1', digits: 6 })).toThrow(RangeError);
    expect(() => generateHotp(secret, 1.5, { algorithm: 'SHA1', digits: 6 })).toThrow(RangeError);
  });

  it('zero-pads short codes to the requested digit count', () => {
    // Spot-check that output length always equals `digits`, even when the
    // numeric truncation value happens to be small.
    for (let counter = 0; counter < 50; counter++) {
      const code = generateHotp(secret, counter, { algorithm: 'SHA1', digits: 6 });
      expect(code).toHaveLength(6);
      expect(code).toMatch(/^\d{6}$/);
    }
  });

  it('8-digit codes are 8 characters, zero-padded', () => {
    for (let counter = 0; counter < 50; counter++) {
      const code = generateHotp(secret, counter, { algorithm: 'SHA1', digits: 8 });
      expect(code).toHaveLength(8);
    }
  });

  it('different counters produce different codes (overwhelmingly likely)', () => {
    const codes = new Set<string>();
    for (let counter = 0; counter < 20; counter++) {
      codes.add(generateHotp(secret, counter, { algorithm: 'SHA1', digits: 6 }));
    }
    expect(codes.size).toBeGreaterThan(15);
  });
});
