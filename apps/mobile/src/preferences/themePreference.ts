import { preferencesStorage } from './native';

export type ThemePreference = 'system' | 'light' | 'dark';

const THEME_PREFERENCE_KEY = 'theme';

/**
 * Falls back to `'system'` on any storage failure (including the
 * preferences MMKV store failing to open at all — see preferences/native.ts)
 * rather than throwing. A wrong/default theme is cosmetic; this store is
 * explicitly not where anything fail-closed-worthy lives.
 */
export function getThemePreference(): ThemePreference {
  try {
    const value = preferencesStorage.getString(THEME_PREFERENCE_KEY);
    return value === 'light' || value === 'dark' ? value : 'system';
  } catch {
    return 'system';
  }
}

/** Silently no-ops on failure, for the same reason getThemePreference() falls back rather than throws. */
export function setThemePreference(preference: ThemePreference): void {
  try {
    preferencesStorage.set(THEME_PREFERENCE_KEY, preference);
  } catch {
    // Non-critical; see the module doc comment.
  }
}
