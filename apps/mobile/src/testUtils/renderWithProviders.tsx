import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { ThemeProvider } from '../theme/ThemeProvider';
import { VaultSessionProvider } from '../state/VaultSessionProvider';
import { configureNativeTestPlatform } from './configureNativePlatform';

/**
 * Wraps a screen under test with the same providers App.tsx wires up in
 * production, so screens don't need useTheme()/useVaultSession() mocked
 * individually. Callers still need jest.mock('.../crypto/native'),
 * jest.mock('.../storage/native'), jest.mock('.../biometric/native'),
 * and jest.mock('.../preferences/native') as needed, same as every
 * other test in this project.
 */
export function withProviders(ui: React.ReactElement): React.ReactElement {
  configureNativeTestPlatform();
  return (
    <ThemeProvider>
      <VaultSessionProvider>{ui}</VaultSessionProvider>
    </ThemeProvider>
  );
}

/** Same as withProviders, plus a NavigationContainer — for screens that call useNavigation()/useRoute(). */
export function withNavigation(ui: React.ReactElement): React.ReactElement {
  return withProviders(<NavigationContainer>{ui}</NavigationContainer>);
}
