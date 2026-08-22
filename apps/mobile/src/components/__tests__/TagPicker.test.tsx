jest.mock('../../crypto/native');
jest.mock('../../storage/native');
jest.mock('../../biometric/native');
jest.mock('../../preferences/native');
jest.mock('../../clipboard/native');

import React, { useState } from 'react';
import { screen, fireEvent, waitFor } from '@testing-library/react-native';
import { vaultStorage } from '../../storage/native';
import { renderUnlockedScreen, seedVault } from '../../testUtils/renderUnlockedScreen';
import { Tag } from '@flintlock/core';
import { TagPicker } from '../TagPicker';

beforeEach(() => {
  vaultStorage.clearAll();
});

function Harness({ initialTagIds = [] as string[] }: { initialTagIds?: string[] }) {
  const [tagIds, setTagIds] = useState<string[]>(initialTagIds);
  return <TagPicker selectedTagIds={tagIds} onChange={setTagIds} />;
}

function HarnessSelectExisting() {
  const [tagIds, setTagIds] = useState<string[]>([]);
  return <TagPicker selectedTagIds={tagIds} onChange={setTagIds} />;
}

describe('TagPicker', () => {
  it('creates a new tag from typed text and shows it as selected', async () => {
    await seedVault();
    await renderUnlockedScreen(Harness, undefined, 'tag-input');

    await fireEvent.changeText(screen.getByTestId('tag-input'), 'Personal');
    await fireEvent.press(screen.getByTestId('create-tag-button'));

    await waitFor(() => {
      const keys = vaultStorage.getAllKeys().filter((k) => k.startsWith('vault:record:'));
      expect(keys).toHaveLength(1);
    });
    expect(screen.getByText('Personal')).toBeTruthy();
  });

  it('suggests and adds an existing tag instead of creating a duplicate', async () => {
    const seed = await seedVault();
    const tag: Tag = { id: 'tag-work', recordType: 'tag', name: 'Work', color: '#111111' };
    await seed.putRecord(tag);
    seed.lock();

    await renderUnlockedScreen(HarnessSelectExisting, undefined, 'tag-input');
    await fireEvent.changeText(screen.getByTestId('tag-input'), 'Work');

    await waitFor(() => {
      expect(screen.getByTestId('suggestion-tag-work')).toBeTruthy();
    });
    expect(screen.queryByTestId('create-tag-button')).toBeNull();

    await fireEvent.press(screen.getByTestId('suggestion-tag-work'));

    await waitFor(() => {
      expect(screen.getByTestId('selected-tag-tag-work')).toBeTruthy();
    });
  });

  it('removes a selected tag when its × is pressed', async () => {
    await seedVault();
    await renderUnlockedScreen(Harness, undefined, 'tag-input');

    await fireEvent.changeText(screen.getByTestId('tag-input'), 'Personal');
    await fireEvent.press(screen.getByTestId('create-tag-button'));

    await waitFor(() => {
      expect(screen.getByText('Personal')).toBeTruthy();
    });

    const removeButtons = screen.getAllByLabelText(/Remove tag Personal/);
    await fireEvent.press(removeButtons[0]!);

    expect(screen.queryByText('Personal')).toBeNull();
  });
});
