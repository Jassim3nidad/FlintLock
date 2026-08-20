jest.mock('../../crypto/native');
jest.mock('../../storage/native');
jest.mock('../../biometric/native');
jest.mock('../../preferences/native');

import { screen, fireEvent, waitFor } from '@testing-library/react-native';
import { vaultStorage } from '../../storage/native';
import { renderUnlockedScreen, seedVault } from '../../testUtils/renderUnlockedScreen';
import { AddTotpScreen } from '../AddTotpScreen';

beforeEach(() => {
  vaultStorage.clearAll();
});

describe('AddTotpScreen — manual entry', () => {
  it('creates a standalone TOTP entry', async () => {
    await seedVault();
    await renderUnlockedScreen(AddTotpScreen, undefined, 'secret-input');

    await fireEvent.changeText(screen.getByTestId('issuer-input'), 'Example');
    await fireEvent.changeText(screen.getByTestId('account-input'), 'alice');
    await fireEvent.changeText(screen.getByTestId('secret-input'), 'JBSWY3DPEHPK3PXP');
    await fireEvent.press(screen.getByTestId('save-manual-button'));

    await waitFor(() => {
      const keys = vaultStorage.getAllKeys().filter((k) => k.startsWith('vault:record:'));
      expect(keys).toHaveLength(1);
    });
  });

  it('creates a TOTP entry attached to a credential when a credentialId param is given', async () => {
    const seed = await seedVault();
    const now = Date.now();
    seed.putRecord({
      id: 'cred-1',
      recordType: 'credential',
      title: 'X',
      username: 'a',
      password: 'p',
      urls: [],
      notes: '',
      tagIds: [],
      customFields: [],
      favorite: false,
      passwordHistory: [],
      createdAt: now,
      updatedAt: now,
      passwordUpdatedAt: now,
      lastUsedAt: null,
      deletedAt: null,
    });
    seed.lock();

    await renderUnlockedScreen(AddTotpScreen, { credentialId: 'cred-1' }, 'secret-input');
    await fireEvent.changeText(screen.getByTestId('secret-input'), 'JBSWY3DPEHPK3PXP');
    await fireEvent.press(screen.getByTestId('save-manual-button'));

    await waitFor(() => {
      const keys = vaultStorage.getAllKeys().filter((k) => k.startsWith('vault:record:'));
      expect(keys).toHaveLength(2); // credential + totp entry
    });
  });

  it('shows an error for an invalid base32 secret', async () => {
    await seedVault();
    await renderUnlockedScreen(AddTotpScreen, undefined, 'secret-input');

    await fireEvent.changeText(screen.getByTestId('secret-input'), 'not valid base32!!!');
    await fireEvent.press(screen.getByTestId('save-manual-button'));

    await waitFor(() => {
      expect(screen.getByTestId('form-error')).toBeTruthy();
    });
  });
});

describe('AddTotpScreen — otpauth URI', () => {
  it('creates an entry from a pasted otpauth:// URI', async () => {
    await seedVault();
    await renderUnlockedScreen(AddTotpScreen, undefined, 'secret-input');

    await fireEvent.press(screen.getByTestId('chip-uri'));
    await fireEvent.changeText(
      screen.getByTestId('uri-input'),
      'otpauth://totp/Example:alice@example.com?secret=JBSWY3DPEHPK3PXP&issuer=Example'
    );
    await fireEvent.press(screen.getByTestId('save-uri-button'));

    await waitFor(() => {
      const keys = vaultStorage.getAllKeys().filter((k) => k.startsWith('vault:record:'));
      expect(keys).toHaveLength(1);
    });
  });

  it('shows an error for an invalid otpauth URI', async () => {
    await seedVault();
    await renderUnlockedScreen(AddTotpScreen, undefined, 'secret-input');

    await fireEvent.press(screen.getByTestId('chip-uri'));
    await fireEvent.changeText(screen.getByTestId('uri-input'), 'not a real code');
    await fireEvent.press(screen.getByTestId('save-uri-button'));

    await waitFor(() => {
      expect(screen.getByTestId('form-error')).toBeTruthy();
    });
  });
});
