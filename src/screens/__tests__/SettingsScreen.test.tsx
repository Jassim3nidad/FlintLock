jest.mock('../../crypto/native');
jest.mock('../../storage/native');
jest.mock('../../biometric/native');
jest.mock('../../preferences/native');

import { screen, fireEvent, waitFor } from '@testing-library/react-native';
import { vaultStorage } from '../../storage/native';
import { unlockWithBiometrics } from '../../biometric/biometricVault';
import { renderUnlockedScreen, seedVault, TEST_PASSWORD } from '../../testUtils/renderUnlockedScreen';
import { SettingsScreen } from '../SettingsScreen';

beforeEach(() => {
  vaultStorage.clearAll();
});

describe('SettingsScreen — auto-lock and background settings', () => {
  it('changing the auto-lock option persists it to the vault header', async () => {
    await seedVault();
    await renderUnlockedScreen(SettingsScreen, undefined, 'lock-now-button');

    await fireEvent.press(screen.getByTestId('option-5m'));

    await waitFor(() => {
      const header = JSON.parse(vaultStorage.getString('vault:header')!);
      expect(header.settings.autoLock).toBe('5m');
    });
  });

  it('toggling lock-on-background persists it', async () => {
    await seedVault();
    await renderUnlockedScreen(SettingsScreen, undefined, 'lock-now-button');

    await fireEvent(screen.getByTestId('lock-on-background-switch'), 'valueChange', false);

    await waitFor(() => {
      const header = JSON.parse(vaultStorage.getString('vault:header')!);
      expect(header.settings.lockOnBackground).toBe(false);
    });
  });

  it('has Export vault and Import vault buttons', async () => {
    await seedVault();
    await renderUnlockedScreen(SettingsScreen, undefined, 'lock-now-button');

    expect(screen.getByTestId('export-nav-button')).toBeTruthy();
    expect(screen.getByTestId('import-nav-button')).toBeTruthy();
  });

  it('has a Web Bridge transfer button', async () => {
    await seedVault();
    await renderUnlockedScreen(SettingsScreen, undefined, 'lock-now-button');

    expect(screen.getByTestId('web-bridge-nav-button')).toBeTruthy();
  });
});

describe('SettingsScreen — biometric enrollment', () => {
  it('toggling biometrics on shows a password-confirmation panel, not immediate enrollment', async () => {
    await seedVault();
    await renderUnlockedScreen(SettingsScreen, undefined, 'lock-now-button');

    await fireEvent(screen.getByTestId('biometric-switch'), 'valueChange', true);

    await waitFor(() => {
      expect(screen.getByTestId('biometric-confirm-panel')).toBeTruthy();
    });
    // Not enrolled yet — enrollment happens only after password confirmation.
    const header = JSON.parse(vaultStorage.getString('vault:header')!);
    expect(header.settings.biometricUnlockEnabled).toBe(false);
  });

  it('confirming with the correct password enrolls biometrics and updates settings', async () => {
    await seedVault();
    await renderUnlockedScreen(SettingsScreen, undefined, 'lock-now-button');

    await fireEvent(screen.getByTestId('biometric-switch'), 'valueChange', true);
    await waitFor(() => expect(screen.getByTestId('biometric-confirm-panel')).toBeTruthy());

    await fireEvent.changeText(screen.getByTestId('biometric-confirm-password'), TEST_PASSWORD.toString('utf8'));
    await fireEvent.press(screen.getByTestId('biometric-confirm-button'));

    await waitFor(() => {
      const header = JSON.parse(vaultStorage.getString('vault:header')!);
      expect(header.settings.biometricUnlockEnabled).toBe(true);
    });
    const dek = await unlockWithBiometrics();
    expect(dek).not.toBeNull();
  });

  it('confirming with the wrong password shows an error and does not enable the setting', async () => {
    await seedVault();
    await renderUnlockedScreen(SettingsScreen, undefined, 'lock-now-button');

    await fireEvent(screen.getByTestId('biometric-switch'), 'valueChange', true);
    await waitFor(() => expect(screen.getByTestId('biometric-confirm-panel')).toBeTruthy());

    await fireEvent.changeText(screen.getByTestId('biometric-confirm-password'), 'wrong password');
    await fireEvent.press(screen.getByTestId('biometric-confirm-button'));

    await waitFor(() => {
      expect(screen.getByTestId('biometric-error')).toHaveTextContent(/incorrect master password/i);
    });
    const header = JSON.parse(vaultStorage.getString('vault:header')!);
    expect(header.settings.biometricUnlockEnabled).toBe(false);
  });
});

describe('SettingsScreen — lock now', () => {
  it('locking clears the session immediately', async () => {
    await seedVault();
    await renderUnlockedScreen(SettingsScreen, undefined, 'lock-now-button');
    await fireEvent.press(screen.getByTestId('lock-now-button'));
    // No direct observable here beyond not throwing — isUnlocked lives in
    // VaultSessionProvider, exercised more directly in its own test file.
  });
});
