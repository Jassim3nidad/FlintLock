jest.mock('../../crypto/native');
jest.mock('../../storage/native');
jest.mock('../../biometric/native');
jest.mock('../../preferences/native');
jest.mock('../../clipboard/native');

import { screen, fireEvent, waitFor } from '@testing-library/react-native';
import { vaultStorage } from '../../storage/native';
import { Clipboard } from '../../clipboard/native';
import { Credential } from '../../storage/schema';
import { renderUnlockedScreen, seedVault } from '../../testUtils/renderUnlockedScreen';
import { CredentialDetailScreen } from '../CredentialDetailScreen';

function makeCredential(overrides: Partial<Credential> = {}): Credential {
  const now = Date.now();
  return {
    id: 'cred-1',
    recordType: 'credential',
    title: 'Example',
    username: 'alice',
    password: 'hunter2',
    urls: ['https://example.com'],
    notes: 'some notes',
    tagIds: [],
    customFields: [],
    favorite: false,
    passwordHistory: [],
    createdAt: now,
    updatedAt: now,
    passwordUpdatedAt: now,
    lastUsedAt: null,
    deletedAt: null,
    ...overrides,
  };
}

beforeEach(() => {
  vaultStorage.clearAll();
});

describe('CredentialDetailScreen', () => {
  it('renders the credential fields', async () => {
    const seed = await seedVault();
    seed.putRecord(makeCredential());
    seed.lock();

    await renderUnlockedScreen(CredentialDetailScreen, { credentialId: 'cred-1' }, 'credential-title');

    expect(screen.getByTestId('credential-title')).toHaveTextContent('Example');
    expect(screen.getByText('alice')).toBeTruthy();
    expect(screen.getByText('hunter2')).toBeTruthy();
  });

  it('copies the password to the clipboard and shows a countdown', async () => {
    const seed = await seedVault();
    seed.putRecord(makeCredential());
    seed.lock();

    await renderUnlockedScreen(CredentialDetailScreen, { credentialId: 'cred-1' }, 'credential-title');

    await fireEvent.press(screen.getAllByLabelText('Copy Password')[0]!);

    await waitFor(() => {
      expect(screen.getByTestId('copy-countdown')).toBeTruthy();
    });
    expect(await Clipboard.getString()).toBe('hunter2');
  });

  it('moving to trash soft-deletes the credential', async () => {
    const seed = await seedVault();
    seed.putRecord(makeCredential());
    seed.lock();

    await renderUnlockedScreen(CredentialDetailScreen, { credentialId: 'cred-1' }, 'credential-title');
    await fireEvent.press(screen.getByTestId('trash-button'));

    await waitFor(() => {
      const raw = vaultStorage.getBuffer('vault:record:cred-1');
      expect(raw).toBeDefined();
    });
  });

  it('shows a fallback message for a credential that no longer exists', async () => {
    await seedVault();
    await renderUnlockedScreen(CredentialDetailScreen, { credentialId: 'does-not-exist' }, 'missing-credential-message');
  });

  it('shows an attached TOTP code, and none when there is no attached authenticator', async () => {
    const seed = await seedVault();
    seed.putRecord(makeCredential());
    const now = Date.now();
    seed.putRecord({
      id: 'totp-1',
      recordType: 'totp',
      credentialId: 'cred-1',
      issuer: 'Example',
      account: 'alice',
      secret: 'JBSWY3DPEHPK3PXP',
      algorithm: 'SHA1',
      digits: 6,
      mode: 'totp',
      period: 30,
      counter: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });
    seed.lock();

    await renderUnlockedScreen(CredentialDetailScreen, { credentialId: 'cred-1' }, 'credential-title');

    await waitFor(() => {
      expect(screen.getByTestId('totp-code-totp-1')).toBeTruthy();
    });
  });

  it('has an "Add 2FA" button that navigates to AddTotp with this credential\'s id', async () => {
    const seed = await seedVault();
    seed.putRecord(makeCredential());
    seed.lock();

    await renderUnlockedScreen(CredentialDetailScreen, { credentialId: 'cred-1' }, 'credential-title');
    expect(screen.getByTestId('add-totp-button')).toBeTruthy();
  });
});
