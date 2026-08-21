jest.mock('../native');

import { preferencesStorage } from '../native';
import { getThemePreference, setThemePreference } from '../themePreference';

beforeEach(() => {
  preferencesStorage.clearAll();
});

describe('getThemePreference / setThemePreference', () => {
  it('defaults to "system" when nothing has been set', () => {
    expect(getThemePreference()).toBe('system');
  });

  it('round-trips an explicit preference', () => {
    setThemePreference('dark');
    expect(getThemePreference()).toBe('dark');
    setThemePreference('light');
    expect(getThemePreference()).toBe('light');
  });

  it('falls back to "system" for a corrupted/unexpected stored value', () => {
    preferencesStorage.set('theme', 'not-a-real-value');
    expect(getThemePreference()).toBe('system');
  });
});
