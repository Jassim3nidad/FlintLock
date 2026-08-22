import { Buffer } from 'buffer';
import { configureTestPlatform, resetPlatformForTests } from '../../testing/configureTestPlatform';
import { generateTotp, totpCounter, totpSecondsRemaining } from '../totp';
import { TOTP_VECTORS } from '../../testing/vectors/totp.vectors';

beforeEach(() => configureTestPlatform());
afterEach(() => resetPlatformForTests());

describe('generateTotp — RFC 6238 Appendix B known-answer vectors', () => {
  for (const v of TOTP_VECTORS) {
    it(`t=${v.unixTimeSeconds} ${v.algorithm} -> ${v.expectedCode}`, async () => {
      const secret = Buffer.from(v.secretHex, 'hex');
      const code = await generateTotp(secret, { algorithm: v.algorithm, digits: 8, period: 30 }, v.unixTimeSeconds);
      expect(code).toBe(v.expectedCode);
    });
  }
});

describe('totpCounter', () => {
  it('is floor(time / period), T0 = 0', () => {
    expect(totpCounter(59, 30)).toBe(1);
    expect(totpCounter(60, 30)).toBe(2);
    expect(totpCounter(0, 30)).toBe(0);
    expect(totpCounter(29, 30)).toBe(0);
  });
});

describe('totpSecondsRemaining', () => {
  it('counts down within a period and wraps at the boundary', () => {
    expect(totpSecondsRemaining({ period: 30 }, 0)).toBe(30);
    expect(totpSecondsRemaining({ period: 30 }, 1)).toBe(29);
    expect(totpSecondsRemaining({ period: 30 }, 29)).toBe(1);
    expect(totpSecondsRemaining({ period: 30 }, 30)).toBe(30);
  });
});

describe('generateTotp — default digits/period behave sanely', () => {
  it('produces a 6-digit code with default SHA1 params', async () => {
    const secret = Buffer.from('12345678901234567890', 'utf8');
    const code = await generateTotp(secret, { algorithm: 'SHA1', digits: 6, period: 30 }, 59);
    expect(code).toHaveLength(6);
  });

  it('the same second-window produces the same code, and adjacent windows differ', async () => {
    const secret = Buffer.from('12345678901234567890', 'utf8');
    const params = { algorithm: 'SHA1' as const, digits: 6 as const, period: 30 };
    // Window 3 spans [90, 119]; window 4 starts at 120.
    const a = await generateTotp(secret, params, 100);
    const b = await generateTotp(secret, params, 119); // same 30s window as 100
    const c = await generateTotp(secret, params, 120); // next window
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
});
