jest.mock('../../crypto/native');
jest.mock('../../storage/native');
jest.mock('../../biometric/native');
jest.mock('../../preferences/native');

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { vaultStorage } from '../../storage/native';
import { withProviders } from '../../testUtils/renderWithProviders';
import { CreateVaultScreen } from '../CreateVaultScreen';

beforeEach(() => {
  vaultStorage.clearAll();
});

describe('CreateVaultScreen', () => {
  it('shows the no-recovery warning', async () => {
    await render(withProviders(<CreateVaultScreen />));
    expect(screen.getByTestId('no-recovery-warning')).toBeTruthy();
    expect(screen.getByText(/no password recovery/i)).toBeTruthy();
  });

  it('rejects a password shorter than the minimum length', async () => {
    await render(withProviders(<CreateVaultScreen />));
    await fireEvent.changeText(screen.getByTestId('password-input'), 'short');
    await fireEvent.changeText(screen.getByTestId('confirm-input'), 'short');
    await fireEvent.press(screen.getByTestId('create-vault-button'));
    expect(screen.getByTestId('form-error')).toHaveTextContent(/at least 8 characters/i);
  });

  it('rejects mismatched passwords', async () => {
    await render(withProviders(<CreateVaultScreen />));
    await fireEvent.changeText(screen.getByTestId('password-input'), 'correct horse battery');
    await fireEvent.changeText(screen.getByTestId('confirm-input'), 'different password here');
    await fireEvent.press(screen.getByTestId('create-vault-button'));
    expect(screen.getByTestId('form-error')).toHaveTextContent(/do not match/i);
  });

  it('shows an entropy estimate as the password is typed', async () => {
    await render(withProviders(<CreateVaultScreen />));
    await fireEvent.changeText(screen.getByTestId('password-input'), 'correct horse battery staple');
    expect(screen.getByTestId('entropy-display')).toBeTruthy();
  });

  it('creates the vault and clears the password fields from state on success', async () => {
    await render(withProviders(<CreateVaultScreen />));
    await fireEvent.changeText(screen.getByTestId('password-input'), 'correct horse battery staple');
    await fireEvent.changeText(screen.getByTestId('confirm-input'), 'correct horse battery staple');
    await fireEvent.press(screen.getByTestId('create-vault-button'));

    await waitFor(() => {
      expect(vaultStorage.contains('vault:header')).toBe(true);
    });
    expect(screen.getByTestId('password-input').props.value).toBe('');
    expect(screen.getByTestId('confirm-input').props.value).toBe('');
  });
});
