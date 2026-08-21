import { contrastRatio, meetsWcagAA } from '../contrast';

describe('contrastRatio', () => {
  it('black on white is the maximum ratio, 21:1', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 1);
  });

  it('a color against itself is the minimum ratio, 1:1', () => {
    expect(contrastRatio('#336699', '#336699')).toBeCloseTo(1, 5);
  });

  it('is symmetric regardless of argument order', () => {
    expect(contrastRatio('#123456', '#abcdef')).toBeCloseTo(contrastRatio('#abcdef', '#123456'), 10);
  });
});

describe('meetsWcagAA', () => {
  it('passes for a pair known to clear the threshold', () => {
    expect(meetsWcagAA('#000000', '#FFFFFF', 4.5)).toBe(true);
  });

  it('fails for a pair known to fall short', () => {
    expect(meetsWcagAA('#CCCCCC', '#FFFFFF', 4.5)).toBe(false);
  });
});
