/**
 * Design tokens — every color used in the app should come from here, not
 * a hardcoded hex value in a component (spec 5.10). Every text/background
 * pairing below is verified against WCAG AA in
 * src/theme/__tests__/tokens.test.ts, not just chosen by eye.
 *
 * Dark mode is a genuinely separate palette (near-black background,
 * lightened accent colors), not the light palette's colors inverted —
 * spec calls for "true dark," not "inverted greys."
 */

export interface ColorTokens {
  background: string;
  surface: string;
  surfaceRaised: string;
  textPrimary: string;
  textSecondary: string;
  /** Placeholder text, disabled labels — decorative, not required to hit body-text contrast. */
  textMuted: string;
  primary: string;
  /** Text/icon color to use on top of a `primary`-colored surface (a button, for instance). */
  onPrimary: string;
  danger: string;
  onDanger: string;
  success: string;
  warning: string;
  /** Input/interactive-element borders — meets the 3:1 UI-component contrast rule. */
  inputBorder: string;
  /** Purely decorative dividers — intentionally subtler, not held to the UI-component threshold. */
  divider: string;
  /** Focus ring / selected state. */
  focus: string;
}

export const lightColors: ColorTokens = {
  background: '#FFFFFF',
  surface: '#F5F5F7',
  surfaceRaised: '#FFFFFF',
  textPrimary: '#1A1A1E',
  textSecondary: '#55555C',
  textMuted: '#8A8A92',
  primary: '#0B5FFF',
  onPrimary: '#FFFFFF',
  danger: '#D32F2F',
  onDanger: '#FFFFFF',
  success: '#0F7A4B',
  warning: '#9A6400',
  inputBorder: '#8A8A92',
  divider: '#E4E4E8',
  focus: '#0B5FFF',
};

export const darkColors: ColorTokens = {
  background: '#0A0A0C',
  surface: '#17171A',
  surfaceRaised: '#1F1F23',
  textPrimary: '#F2F2F4',
  textSecondary: '#A8A8B0',
  textMuted: '#6E6E76',
  primary: '#4C8DFF',
  onPrimary: '#0A0A0C',
  danger: '#FF6B6B',
  onDanger: '#0A0A0C',
  success: '#4ADE80',
  warning: '#F5B14C',
  inputBorder: '#6E6E76',
  divider: '#2C2C30',
  focus: '#4C8DFF',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const radius = {
  sm: 6,
  md: 10,
  lg: 16,
  pill: 999,
} as const;

export const typography = {
  title: { fontSize: 28, fontWeight: '700' as const },
  heading: { fontSize: 20, fontWeight: '600' as const },
  body: { fontSize: 16, fontWeight: '400' as const },
  label: { fontSize: 13, fontWeight: '500' as const },
  caption: { fontSize: 12, fontWeight: '400' as const },
};

export type ThemeMode = 'light' | 'dark';

export interface Theme {
  mode: ThemeMode;
  colors: ColorTokens;
  spacing: typeof spacing;
  radius: typeof radius;
  typography: typeof typography;
}

export function getTheme(mode: ThemeMode): Theme {
  return { mode, colors: mode === 'dark' ? darkColors : lightColors, spacing, radius, typography };
}
