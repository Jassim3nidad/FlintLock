jest.mock('../../crypto/native');
jest.mock('../../storage/native');
jest.mock('../../biometric/native');
jest.mock('../../preferences/native');

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { Buffer, deriveKek, unwrapDek, dekWrapAad } from '../../crypto';
import { vaultStorage } from '../../storage/native';
import { VaultStore } from '../../storage/vaultStore';
import { enrollBiometricUnlock } from '../../biometric/biometricVault';
import { withProviders } from '../../testUtils/renderWithProviders';
import { UnlockScreen } from '../UnlockScreen';

const FAST_KDF = { kdf: 'pbkdf2' as const, iterations: 100, digest: 'sha256' as const };
const PASSWORD = 'correct horse battery staple';

beforeEach(() => {
  vaultStorage.clearAll();
});

describe('UnlockScreen', () => {
  it('unlocks with the correct password', async () => {
    await VaultStore.create(Buffer.from(PASSWORD), FAST_KDF);
    await render(withProviders(<UnlockScreen />));

    await fireEvent.changeText(screen.getByTestId('password-input'), PASSWORD);
    await fireEvent.press(screen.getByTestId('unlock-button'));

    await waitFor(() => {
      expect(screen.queryByTestId('form-error')).toBeNull();
    });
  });

  it('shows an error for the wrong password and clears the field', async () => {
    await VaultStore.create(Buffer.from(PASSWORD), FAST_KDF);
    await render(withProviders(<UnlockScreen />));

    await fireEvent.changeText(screen.getByTestId('password-input'), 'wrong password');
    await fireEvent.press(screen.getByTestId('unlock-button'));

    await waitFor(() => {
      expect(screen.getByTestId('form-error')).toHaveTextContent(/incorrect master password/i);
    });
    expect(screen.getByTestId('password-input').props.value).toBe('');
  });

  it('does not show a biometric-unlock button when biometrics are not enabled for this vault', async () => {
    await VaultStore.create(Buffer.from(PASSWORD), FAST_KDF);
    await render(withProviders(<UnlockScreen />));
    await waitFor(() => {
      expect(screen.queryByTestId('biometric-unlock-button')).toBeNull();
    });
  });

  it('shows a biometric-unlock button once biometrics are enabled, and it unlocks the vault', async () => {
    const store = await VaultStore.create(Buffer.from(PASSWORD), FAST_KDF);
    store.updateSettings({ biometricUnlockEnabled: true });

    // Enroll a DEK under the biometric key, the same way the settings
    // screen's "enable biometric unlock" flow will (Phase not yet built
    // — this stands in for it directly via the service layer).
    const header = JSON.parse(vaultStorage.getString('vault:header')!);
    const kek = await deriveKek(Buffer.from(PASSWORD), header.kdf, Buffer.from(header.salt, 'base64'));
    const dek = unwrapDek(
      {
        iv: Buffer.from(header.wrappedDek.iv, 'base64'),
        ciphertext: Buffer.from(header.wrappedDek.ciphertext, 'base64'),
        authTag: Buffer.from(header.wrappedDek.authTag, 'base64'),
      },
      kek,
      dekWrapAad(header.vaultId, header.kdfParamsVersion)
    );
    await enrollBiometricUnlock(dek);

    await render(withProviders(<UnlockScreen />));

    await waitFor(() => {
      expect(screen.getByTestId('biometric-unlock-button')).toBeTruthy();
    });
    await fireEvent.press(screen.getByTestId('biometric-unlock-button'));

    await waitFor(() => {
      expect(screen.queryByTestId('form-error')).toBeNull();
    });
  });
});
