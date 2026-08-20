import { contrastRatio, meetsWcagAA, WCAG_AA_NORMAL_TEXT, WCAG_AA_UI_COMPONENT } from '../contrast';
import { darkColors, lightColors } from '../tokens';

describe.each([
  ['light', lightColors],
  ['dark', darkColors],
] as const)('%s palette — WCAG AA', (_name, colors) => {
  it('textPrimary on background meets normal-text AA (4.5:1)', () => {
    expect(meetsWcagAA(colors.textPrimary, colors.background, WCAG_AA_NORMAL_TEXT)).toBe(true);
  });

  it('textSecondary on background meets normal-text AA (4.5:1)', () => {
    expect(meetsWcagAA(colors.textSecondary, colors.background, WCAG_AA_NORMAL_TEXT)).toBe(true);
  });

  it('textPrimary on surface meets normal-text AA (4.5:1)', () => {
    expect(meetsWcagAA(colors.textPrimary, colors.surface, WCAG_AA_NORMAL_TEXT)).toBe(true);
  });

  it('onPrimary on primary meets normal-text AA (button label contrast)', () => {
    expect(meetsWcagAA(colors.onPrimary, colors.primary, WCAG_AA_NORMAL_TEXT)).toBe(true);
  });

  it('onDanger on danger meets normal-text AA (destructive button label contrast)', () => {
    expect(meetsWcagAA(colors.onDanger, colors.danger, WCAG_AA_NORMAL_TEXT)).toBe(true);
  });

  it('danger on background meets normal-text AA (inline error text)', () => {
    expect(meetsWcagAA(colors.danger, colors.background, WCAG_AA_NORMAL_TEXT)).toBe(true);
  });

  it('success on background meets normal-text AA', () => {
    expect(meetsWcagAA(colors.success, colors.background, WCAG_AA_NORMAL_TEXT)).toBe(true);
  });

  it('inputBorder on background meets the UI-component threshold (3:1)', () => {
    expect(meetsWcagAA(colors.inputBorder, colors.background, WCAG_AA_UI_COMPONENT)).toBe(true);
  });

  it('focus ring meets the UI-component threshold (3:1) against background', () => {
    expect(meetsWcagAA(colors.focus, colors.background, WCAG_AA_UI_COMPONENT)).toBe(true);
  });
});

describe('dark mode is true dark, not the light palette inverted', () => {
  it('dark background is near-black, not a mid-grey', () => {
    // A naive "invert the light palette" background would land near
    // #000000 too, so this alone doesn't prove much — the real test is
    // that every dark token below was chosen independently (see
    // tokens.ts) rather than derived by inverting lightColors.
    expect(contrastRatio(darkColors.background, '#FFFFFF')).toBeGreaterThan(15);
  });

  it('dark and light palettes are not simple inversions of one another', () => {
    // If dark mode were "invert light mode," textPrimary would be the
    // inverse of lightColors.textPrimary. It isn't — it was picked on
    // its own merits against the dark background.
    const invert = (hex: string) => {
      const n = parseInt(hex.slice(1), 16);
      const inverted = 0xffffff - n;
      return `#${inverted.toString(16).padStart(6, '0')}`;
    };
    expect(darkColors.textPrimary.toLowerCase()).not.toBe(invert(lightColors.textPrimary).toLowerCase());
  });
});
