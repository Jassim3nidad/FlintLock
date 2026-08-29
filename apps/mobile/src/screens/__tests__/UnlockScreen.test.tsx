jest.mock('../../crypto/native');
jest.mock('../../storage/native');
jest.mock('../../biometric/native');
jest.mock('../../preferences/native');
jest.mock('../../clipboard/native');
// The jest preset's Haste config defaults Platform.OS to 'ios' (see
// @react-native/jest-preset/jest-preset.js) — nativeBiometricKeySource.ts's
// isLikelyInvalidation() is Android-only, so without this override every
// test below exercising it would silently exercise nothing. Requires the
// library's own real Platform.android.js (jest.requireActual on the exact
// platform-suffixed file, bypassing the default-platform resolution)
// rather than a hand-rolled stand-in — other code in the render tree
// (react-navigation's theming, in particular) calls Platform.select()
// too, and a stand-in that only satisfies this file's own direct usage
// risks being subtly wrong for theirs.
jest.mock('react-native/Libraries/Utilities/Platform', () =>
  jest.requireActual('react-native/Libraries/Utilities/Platform.android')
);

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { Buffer, dekWrapAad, deriveKek, getBiometricKeySource, unwrapKey, VaultStore } from '@flintlock/core';
import { vaultStorage } from '../../storage/native';
import { withProviders } from '../../testUtils/renderWithProviders';
import { configureNativeTestPlatform } from '../../testUtils/configureNativePlatform';
import { UnlockScreen } from '../UnlockScreen';

// jest.mock('../../biometric/native') and a direct import of its __mocks__
// file load as two independent module instances — jest.requireMock is the
// only way to reach the exact instance nativeBiometricKeySource.ts uses.
const mockBiometricNative = jest.requireMock<typeof import('../../biometric/__mocks__/native')>(
  '../../biometric/native'
);

const FAST_KDF = { kdf: 'pbkdf2' as const, iterations: 100, digest: 'sha256' as const };
const PASSWORD = 'correct horse battery staple';

beforeEach(() => {
  configureNativeTestPlatform();
  vaultStorage.clearAll();
  mockBiometricNative.__reset();
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
    await store.updateSettings({ biometricUnlockEnabled: true });

    // Enroll a DEK under the biometric key, the same way the settings
    // screen's "enable biometric unlock" flow will (Phase not yet built
    // — this stands in for it directly via the service layer).
    const header = JSON.parse(Buffer.from(vaultStorage.getBuffer('vault:header')!).toString('utf8'));
    const kek = await deriveKek(Buffer.from(PASSWORD), header.kdf, Buffer.from(header.salt, 'base64'));
    const dek = await unwrapKey(
      {
        iv: Buffer.from(header.wrappedDek.iv, 'base64'),
        ciphertext: Buffer.from(header.wrappedDek.ciphertext, 'base64'),
        authTag: Buffer.from(header.wrappedDek.authTag, 'base64'),
      },
      kek,
      dekWrapAad(header.vaultId, header.kdfParamsVersion)
    );
    await getBiometricKeySource().enroll(dek);

    await render(withProviders(<UnlockScreen />));

    await waitFor(() => {
      expect(screen.getByTestId('biometric-unlock-button')).toBeTruthy();
    });
    await fireEvent.press(screen.getByTestId('biometric-unlock-button'));

    await waitFor(() => {
      expect(screen.queryByTestId('form-error')).toBeNull();
    });
  });

  it('an invalidated biometric key (F3): shows a specific message, hides the button, and turns the setting off — not the generic failure message, and not stuck offering a button that can never work again', async () => {
    const store = await VaultStore.create(Buffer.from(PASSWORD), FAST_KDF);
    await store.updateSettings({ biometricUnlockEnabled: true });

    const header = JSON.parse(Buffer.from(vaultStorage.getBuffer('vault:header')!).toString('utf8'));
    const kek = await deriveKek(Buffer.from(PASSWORD), header.kdf, Buffer.from(header.salt, 'base64'));
    const dek = await unwrapKey(
      {
        iv: Buffer.from(header.wrappedDek.iv, 'base64'),
        ciphertext: Buffer.from(header.wrappedDek.ciphertext, 'base64'),
        authTag: Buffer.from(header.wrappedDek.authTag, 'base64'),
      },
      kek,
      dekWrapAad(header.vaultId, header.kdfParamsVersion)
    );
    await getBiometricKeySource().enroll(dek);

    await render(withProviders(<UnlockScreen />));
    await waitFor(() => {
      expect(screen.getByTestId('biometric-unlock-button')).toBeTruthy();
    });

    // Simulates a real biometric re-enrollment having invalidated the
    // key since it was set up — this is F3's originally-flagged gap:
    // before this session's fix, nativeBiometricKeySource.unlock() had
    // no try/catch at all, so this mock throwing would have been an
    // unhandled rejection reaching no error UI whatsoever, not even the
    // generic message.
    mockBiometricNative.__simulateBiometricEnrollmentChange();
    await fireEvent.press(screen.getByTestId('biometric-unlock-button'));

    await waitFor(() => {
      expect(screen.getByTestId('form-error')).toHaveTextContent(/biometric enrollment changed/i);
    });
    // Not the generic "cancelled or failed" / "biometric unlock failed"
    // wording — this is a materially different situation the user needs
    // told differently.
    expect(screen.getByTestId('form-error')).not.toHaveTextContent(/cancelled or failed/i);

    // The button itself should be gone now — nothing left to tap that
    // can only ever fail the same way again.
    expect(screen.queryByTestId('biometric-unlock-button')).toBeNull();

    // And the underlying setting should actually be off, not just the
    // in-memory UI state — confirmed by reading the vault header
    // directly, the same way UnlockScreen itself decides whether to show
    // the button in the first place.
    const settings = await VaultStore.peekSettings();
    expect(settings?.biometricUnlockEnabled).toBe(false);
  });
});
