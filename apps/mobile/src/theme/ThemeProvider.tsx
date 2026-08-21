import React, { createContext, useContext, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
import { getThemePreference, setThemePreference, ThemePreference } from '../preferences/themePreference';
import { getTheme, Theme } from './tokens';

interface ThemeContextValue {
  theme: Theme;
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>(() => getThemePreference());

  const mode = preference === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : preference;
  const theme = useMemo(() => getTheme(mode), [mode]);

  const setPreference = (next: ThemePreference): void => {
    setThemePreference(next);
    setPreferenceState(next);
  };

  const value = useMemo(() => ({ theme, preference, setPreference }), [theme, preference]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme() must be used within a ThemeProvider');
  return ctx.theme;
}

export function useThemePreference(): [ThemePreference, (preference: ThemePreference) => void] {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useThemePreference() must be used within a ThemeProvider');
  return [ctx.preference, ctx.setPreference];
}
