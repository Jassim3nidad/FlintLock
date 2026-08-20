jest.mock('../../crypto/native');
jest.mock('../../storage/native');
jest.mock('../../biometric/native');
jest.mock('../../preferences/native');

import { Alert } from 'react-native';
import { screen, fireEvent, waitFor } from '@testing-library/react-native';
import { vaultStorage } from '../../storage/native';
import { Credential, Tag } from '../../storage/schema';
import { renderUnlockedScreen, seedVault } from '../../testUtils/renderUnlockedScreen';
import { TagManagementScreen } from '../TagManagementScreen';
import { TAG_PALETTE } from '../../components/tagPalette';

function makeTag(id: string, name: string, color = TAG_PALETTE[0]!): Tag {
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

describe('TagManagementScreen', () => {
  it('shows an empty state with no tags', async () => {
    await seedVault();
    await renderUnlockedScreen(TagManagementScreen, undefined, 'empty-tags');
    expect(screen.getByTestId('empty-tags')).toBeTruthy();
  });

  it('lists existing tags', async () => {
    const seed = await seedVault();
    seed.putRecord(makeTag('work', 'Work'));
    seed.lock();

    await renderUnlockedScreen(TagManagementScreen, undefined, 'tag-row-work');
    expect(screen.getByTestId('tag-name-work')).toHaveTextContent('Work');
  });

  it('renames a tag', async () => {
    const seed = await seedVault();
    seed.putRecord(makeTag('work', 'Work'));
    seed.lock();

    await renderUnlockedScreen(TagManagementScreen, undefined, 'tag-row-work');
    await fireEvent.press(screen.getByTestId('tag-name-work'));
    await fireEvent.changeText(screen.getByTestId('tag-name-input-work'), 'Office');
    await fireEvent.press(screen.getByTestId('tag-save-work'));

    await waitFor(() => {
      expect(screen.getByTestId('tag-name-work')).toHaveTextContent('Office');
    });
  });

  it('recolors a tag', async () => {
    const seed = await seedVault();
    seed.putRecord(makeTag('work', 'Work', TAG_PALETTE[0]));
    seed.lock();

    const newColor = TAG_PALETTE[1]!;
    await renderUnlockedScreen(TagManagementScreen, undefined, 'tag-row-work');
    await fireEvent.press(screen.getByTestId(`tag-color-work-${newColor}`));

    await waitFor(() => {
      const raw = vaultStorage.getBuffer('vault:record:work');
      expect(raw).toBeDefined();
    });
  });

  it('deletes a tag (after confirming) and removes it from credentials that referenced it', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
      buttons?.find((b) => b.style === 'destructive')?.onPress?.();
    });

    const seed = await seedVault();
    seed.putRecord(makeTag('work', 'Work'));
    seed.putRecord(makeCredential({ id: 'cred-1', tagIds: ['work'] }));
    seed.lock();

    await renderUnlockedScreen(TagManagementScreen, undefined, 'tag-row-work');
    await fireEvent.press(screen.getByTestId('tag-delete-work'));

    expect(alertSpy).toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.queryByTestId('tag-row-work')).toBeNull();
    });

    const rawCredential = vaultStorage.getBuffer('vault:record:cred-1');
    expect(rawCredential).toBeDefined();

    alertSpy.mockRestore();
  });
});
