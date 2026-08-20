jest.mock('../../crypto/native');
jest.mock('../../storage/native');
jest.mock('../../biometric/native');
jest.mock('../../preferences/native');

import { screen, waitFor } from '@testing-library/react-native';
import { vaultStorage } from '../../storage/native';
import { Credential, TotpEntry } from '../../storage/schema';
import { renderUnlockedScreen, seedVault } from '../../testUtils/renderUnlockedScreen';
import { SecurityDashboardScreen } from '../SecurityDashboardScreen';

function makeCredential(overrides: Partial<Credential> = {}): Credential {
  const now = Date.now();
  return {
    id: overrides.id ?? 'cred-1',
    recordType: 'credential',
    title: 'Example',
    username: 'alice',
    password: 'a very long and strong Pa55word!',
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
    ...overrides,
  };
}

function makeTotpEntry(overrides: Partial<TotpEntry> = {}): TotpEntry {
  const now = Date.now();
  return {
    id: overrides.id ?? 'totp-1',
    recordType: 'totp',
    credentialId: overrides.credentialId ?? null,
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
    ...overrides,
  };
}

beforeEach(() => {
  vaultStorage.clearAll();
});

describe('SecurityDashboardScreen', () => {
  it('shows an all-clear state with no credentials', async () => {
    await seedVault();
    await renderUnlockedScreen(SecurityDashboardScreen, undefined, 'security-all-clear');
    expect(screen.getByTestId('security-all-clear')).toBeTruthy();
  });

  it('flags a weak password', async () => {
    const seed = await seedVault();
    seed.putRecord(makeCredential({ id: 'weak', password: 'abc' }));
    seed.lock();

    await renderUnlockedScreen(SecurityDashboardScreen, undefined, 'weak-password-weak');
    expect(screen.getByTestId('weak-password-weak')).toBeTruthy();
  });

  it('flags reused passwords across credentials sharing the same password', async () => {
    const seed = await seedVault();
    seed.putRecord(makeCredential({ id: 'a', title: 'Site A', password: 'sharedPassword123!' }));
    seed.putRecord(makeCredential({ id: 'b', title: 'Site B', password: 'sharedPassword123!' }));
    seed.lock();

    await renderUnlockedScreen(SecurityDashboardScreen, undefined, 'reused-group-0');
    expect(screen.getByTestId('reused-credential-a')).toBeTruthy();
    expect(screen.getByTestId('reused-credential-b')).toBeTruthy();
  });

  it('flags an old password', async () => {
    const seed = await seedVault();
    const longAgo = Date.now() - 400 * 24 * 60 * 60 * 1000;
    seed.putRecord(makeCredential({ id: 'old', passwordUpdatedAt: longAgo }));
    seed.lock();

    await renderUnlockedScreen(SecurityDashboardScreen, undefined, 'old-password-old');
    expect(screen.getByTestId('old-password-old')).toHaveTextContent(/days old/);
  });

  it('flags credentials with no attached 2FA and excludes those that have one', async () => {
    const seed = await seedVault();
    seed.putRecord(makeCredential({ id: 'no-2fa' }));
    seed.putRecord(makeCredential({ id: 'has-2fa' }));
    seed.putRecord(makeTotpEntry({ id: 'totp-1', credentialId: 'has-2fa' }));
    seed.lock();

    await renderUnlockedScreen(SecurityDashboardScreen, undefined, 'missing-2fa-no-2fa');
    await waitFor(() => {
      expect(screen.getByTestId('missing-2fa-no-2fa')).toBeTruthy();
      expect(screen.queryByTestId('missing-2fa-has-2fa')).toBeNull();
    });
  });
});
