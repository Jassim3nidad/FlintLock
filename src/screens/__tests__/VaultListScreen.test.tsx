jest.mock('../../crypto/native');
jest.mock('../../storage/native');
jest.mock('../../biometric/native');
jest.mock('../../preferences/native');

import { screen, fireEvent, waitFor } from '@testing-library/react-native';
import { vaultStorage } from '../../storage/native';
import { Credential } from '../../storage/schema';
import { renderUnlockedScreen, seedVault } from '../../testUtils/renderUnlockedScreen';
import { VaultListScreen } from '../VaultListScreen';

function makeCredential(overrides: Partial<Credential> = {}): Credential {
  const now = Date.now();
  return {
    id: overrides.id ?? 'cred-1',
    recordType: 'credential',
    title: 'Example',
    username: 'alice',
    password: 'hunter2',
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

beforeEach(() => {
  vaultStorage.clearAll();
});

describe('VaultListScreen', () => {
  it('shows the empty state with no credentials', async () => {
    await seedVault();
    await renderUnlockedScreen(VaultListScreen, undefined, 'search-input');
    await waitFor(() => {
      expect(screen.getByTestId('empty-state')).toHaveTextContent(/no credentials yet/i);
    });
  });

  it('lists credentials by title and username', async () => {
    const seed = await seedVault();
    seed.putRecord(makeCredential({ id: 'a', title: 'GitHub', username: 'octocat' }));
    seed.putRecord(makeCredential({ id: 'b', title: 'Bank', username: 'someone' }));
    seed.lock();

    await renderUnlockedScreen(VaultListScreen, undefined, 'search-input');

    await waitFor(() => {
      expect(screen.getByTestId('credential-row-a')).toBeTruthy();
      expect(screen.getByTestId('credential-row-b')).toBeTruthy();
    });
  });

  it('filters the list as the search query changes', async () => {
    const seed = await seedVault();
    seed.putRecord(makeCredential({ id: 'a', title: 'GitHub', username: 'octocat' }));
    seed.putRecord(makeCredential({ id: 'b', title: 'Bank', username: 'someone' }));
    seed.lock();

    await renderUnlockedScreen(VaultListScreen, undefined, 'search-input');
    await waitFor(() => expect(screen.getByTestId('credential-row-a')).toBeTruthy());

    await fireEvent.changeText(screen.getByTestId('search-input'), 'github');

    await waitFor(() => {
      expect(screen.getByTestId('credential-row-a')).toBeTruthy();
      expect(screen.queryByTestId('credential-row-b')).toBeNull();
    });
  });

  it('excludes soft-deleted (trashed) credentials from the list', async () => {
    const seed = await seedVault();
    seed.putRecord(makeCredential({ id: 'a', title: 'Active' }));
    seed.putRecord(makeCredential({ id: 'b', title: 'Trashed', deletedAt: Date.now() }));
    seed.lock();

    await renderUnlockedScreen(VaultListScreen, undefined, 'search-input');

    await waitFor(() => {
      expect(screen.getByTestId('credential-row-a')).toBeTruthy();
      expect(screen.queryByTestId('credential-row-b')).toBeNull();
    });
  });
});
