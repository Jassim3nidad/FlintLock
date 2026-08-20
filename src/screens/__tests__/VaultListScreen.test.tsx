jest.mock('../../crypto/native');
jest.mock('../../storage/native');
jest.mock('../../biometric/native');
jest.mock('../../preferences/native');

import { screen, fireEvent, waitFor } from '@testing-library/react-native';
import { vaultStorage } from '../../storage/native';
import { Credential, Tag } from '../../storage/schema';
import { renderUnlockedScreen, seedVault } from '../../testUtils/renderUnlockedScreen';
import { VaultListScreen } from '../VaultListScreen';

function makeTag(id: string, name: string, color = '#111111'): Tag {
  return { id, recordType: 'tag', name, color };
}

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

  it('shows no tag filter row when there are no tags', async () => {
    const seed = await seedVault();
    seed.putRecord(makeCredential({ id: 'a', title: 'Active' }));
    seed.lock();

    await renderUnlockedScreen(VaultListScreen, undefined, 'search-input');
    await waitFor(() => expect(screen.getByTestId('credential-row-a')).toBeTruthy());

    expect(screen.queryByTestId('tag-filter-row')).toBeNull();
  });

  it('filters the list by a single selected tag', async () => {
    const seed = await seedVault();
    seed.putRecord(makeTag('work', 'Work'));
    seed.putRecord(makeCredential({ id: 'a', title: 'GitHub', tagIds: ['work'] }));
    seed.putRecord(makeCredential({ id: 'b', title: 'Bank', tagIds: [] }));
    seed.lock();

    await renderUnlockedScreen(VaultListScreen, undefined, 'search-input');
    await waitFor(() => expect(screen.getByTestId('credential-row-a')).toBeTruthy());
    expect(screen.getByTestId('credential-row-b')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('tag-filter-work'));

    await waitFor(() => {
      expect(screen.getByTestId('credential-row-a')).toBeTruthy();
      expect(screen.queryByTestId('credential-row-b')).toBeNull();
    });
  });

  it('combines multiple selected tags with AND by default, then OR after toggling the mode', async () => {
    const seed = await seedVault();
    seed.putRecord(makeTag('work', 'Work'));
    seed.putRecord(makeTag('urgent', 'Urgent'));
    seed.putRecord(makeCredential({ id: 'both', title: 'Both', tagIds: ['work', 'urgent'] }));
    seed.putRecord(makeCredential({ id: 'work-only', title: 'WorkOnly', tagIds: ['work'] }));
    seed.putRecord(makeCredential({ id: 'neither', title: 'Neither', tagIds: [] }));
    seed.lock();

    await renderUnlockedScreen(VaultListScreen, undefined, 'search-input');
    await waitFor(() => expect(screen.getByTestId('credential-row-both')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('tag-filter-work'));
    await fireEvent.press(screen.getByTestId('tag-filter-urgent'));

    await waitFor(() => {
      expect(screen.getByTestId('credential-row-both')).toBeTruthy();
      expect(screen.queryByTestId('credential-row-work-only')).toBeNull();
      expect(screen.queryByTestId('credential-row-neither')).toBeNull();
    });

    await fireEvent.press(screen.getByTestId('tag-filter-mode'));

    await waitFor(() => {
      expect(screen.getByTestId('credential-row-both')).toBeTruthy();
      expect(screen.getByTestId('credential-row-work-only')).toBeTruthy();
      expect(screen.queryByTestId('credential-row-neither')).toBeNull();
    });
  });
});
