import { preferencesStorage } from './native';

export type ThemePreference = 'system' | 'light' | 'dark';

const THEME_PREFERENCE_KEY = 'theme';

export function getThemePreference(): ThemePreference {
  const value = preferencesStorage.getString(THEME_PREFERENCE_KEY);
  return value === 'light' || value === 'dark' ? value : 'system';
}

export function setThemePreference(preference: ThemePreference): void {
  preferencesStorage.set(THEME_PREFERENCE_KEY, preference);
}
