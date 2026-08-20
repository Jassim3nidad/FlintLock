import React from 'react';
import { ThemeProvider } from '../theme/ThemeProvider';
import { VaultSessionProvider } from '../state/VaultSessionProvider';

/**
 * Wraps a screen under test with the same providers App.tsx wires up in
 * production, so screens don't need useTheme()/useVaultSession() mocked
 * individually. Callers still need jest.mock('.../crypto/native'),
 * jest.mock('.../storage/native'), jest.mock('.../biometric/native'),
 * and jest.mock('.../preferences/native') as needed, same as every
 * other test in this project.
 */
export function withProviders(ui: React.ReactElement): React.ReactElement {
  return (
    <ThemeProvider>
      <VaultSessionProvider>{ui}</VaultSessionProvider>
    </ThemeProvider>
  );
}
