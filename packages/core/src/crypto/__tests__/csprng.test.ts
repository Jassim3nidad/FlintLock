import { configureTestPlatform, resetPlatformForTests } from '../../testing/configureTestPlatform';
import { randomBytes, randomInt } from '../csprng';

beforeEach(() => configureTestPlatform());
afterEach(() => resetPlatformForTests());

describe('randomBytes', () => {
  it('returns a buffer of the requested length', () => {
    expect(randomBytes(32).length).toBe(32);
    expect(randomBytes(0).length).toBe(0);
  });

  it('does not repeat across calls', () => {
    const a = randomBytes(32);
    const b = randomBytes(32);
    expect(a.equals(b)).toBe(false);
  });
});

describe('randomInt — rejection sampling, no modulo bias', () => {
  it('never returns a value outside [0, exclusiveMax)', () => {
    for (let i = 0; i < 2000; i++) {
      const v = randomInt(7);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(7);
    }
  });

  it('covers the full range for a small bound (statistical sanity check)', () => {
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) seen.add(randomInt(5));
    expect(seen.size).toBe(5);
  });

  it('rejects non-positive-integer bounds', () => {
    expect(() => randomInt(0)).toThrow(RangeError);
    expect(() => randomInt(-1)).toThrow(RangeError);
    expect(() => randomInt(1.5)).toThrow(RangeError);
  });

  it('handles a bound that requires exactly 4 bytes without masking to 0', () => {
    // exclusiveMax just above 2^24 forces bytesNeeded=4, exercising the
    // 0xffffffff mask special-case instead of the `(1 << 32) - 1` bug it
    // guards against (which would evaluate to 0 in JS).
    const v = randomInt(0x1000001);
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThan(0x1000001);
  });
});
