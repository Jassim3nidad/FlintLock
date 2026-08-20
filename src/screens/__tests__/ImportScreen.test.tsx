jest.mock('../../crypto/native');
jest.mock('../../storage/native');
jest.mock('../../biometric/native');
jest.mock('../../preferences/native');
jest.mock('../../files/native');

import { screen, fireEvent, waitFor } from '@testing-library/react-native';
import { Buffer } from '../../crypto';
import { vaultStorage } from '../../storage/native';
import { Credential } from '../../storage/schema';
import { renderUnlockedScreen, seedVault, TEST_PASSWORD, FAST_KDF } from '../../testUtils/renderUnlockedScreen';
import { exportFlbx } from '../../export/flbxService';
import { UnlockSession } from '../../unlock/session';
import { ImportScreen } from '../ImportScreen';

// jest.mock('../../files/native') and a direct import of the __mocks__
// module load as two independent module instances — jest.requireMock is
// the only way to reach the exact instance ImportScreen.tsx is using.
const mockFileSystem = jest.requireMock<typeof import('../../files/__mocks__/native')>('../../files/native');

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
  mockFileSystem.__reset();
});

describe('ImportScreen', () => {
  it('surfaces the not-yet-implemented file picker as an error rather than crashing', async () => {
    await seedVault();
    await renderUnlockedScreen(ImportScreen, undefined, 'pick-file-button');

    await fireEvent.press(screen.getByTestId('pick-file-button'));

    await waitFor(() => {
      expect(screen.getByTestId('import-error')).toHaveTextContent(/document-picker/i);
    });
  });

  it('does nothing when the file picker is cancelled (returns null)', async () => {
    await seedVault();
    mockFileSystem.__setNextPickedFile(null);
    await renderUnlockedScreen(ImportScreen, undefined, 'pick-file-button');

    await fireEvent.press(screen.getByTestId('pick-file-button'));

    expect(screen.queryByTestId('picked-file-name')).toBeNull();
    expect(screen.queryByTestId('import-error')).toBeNull();
  });

  it('previews and then commits an import of a picked .flbx file', async () => {
    // Build a real .flbx file from a throwaway vault so the preview's
    // decrypt-and-classify logic runs against genuine encrypted bytes.
    const otherVaultSeed = await seedVault();
    otherVaultSeed.putRecord(makeCredential({ id: 'imported-cred', title: 'Imported' }));
    const otherSession = new UnlockSession();
    await otherSession.unlockWithPassword(TEST_PASSWORD);
    const flbxBuffer = await exportFlbx(otherSession, TEST_PASSWORD, FAST_KDF);
    otherSession.lock();
    otherVaultSeed.lock();

    vaultStorage.clearAll();
    await seedVault();
    mockFileSystem.__setNextPickedFile({ name: 'backup.flbx', content: flbxBuffer });

    await renderUnlockedScreen(ImportScreen, undefined, 'pick-file-button');
    await fireEvent.press(screen.getByTestId('pick-file-button'));

    await waitFor(() => {
      expect(screen.getByTestId('picked-file-name')).toHaveTextContent('backup.flbx');
    });

    await fireEvent.changeText(screen.getByTestId('import-password'), TEST_PASSWORD.toString('utf8'));
    await fireEvent.press(screen.getByTestId('preview-button'));

    await waitFor(() => {
      expect(screen.getByTestId('import-preview-entry-imported-cred')).toBeTruthy();
    });
    expect(screen.getByTestId('import-preview-entry-imported-cred')).toHaveTextContent(/add/);

    await fireEvent.press(screen.getByTestId('import-button'));

    await waitFor(() => {
      expect(screen.getByTestId('import-success')).toBeTruthy();
    });
    const raw = vaultStorage.getBuffer('vault:record:imported-cred');
    expect(raw).toBeDefined();
  });

  it('shows an error for an incorrect master password during preview', async () => {
    const otherVaultSeed = await seedVault();
    const otherSession = new UnlockSession();
    await otherSession.unlockWithPassword(TEST_PASSWORD);
    const flbxBuffer = await exportFlbx(otherSession, TEST_PASSWORD, FAST_KDF);
    otherSession.lock();
    otherVaultSeed.lock();

    vaultStorage.clearAll();
    await seedVault();
    mockFileSystem.__setNextPickedFile({ name: 'backup.flbx', content: flbxBuffer });

    await renderUnlockedScreen(ImportScreen, undefined, 'pick-file-button');
    await fireEvent.press(screen.getByTestId('pick-file-button'));
    await waitFor(() => expect(screen.getByTestId('picked-file-name')).toBeTruthy());

    await fireEvent.changeText(screen.getByTestId('import-password'), 'wrong password');
    await fireEvent.press(screen.getByTestId('preview-button'));

    await waitFor(() => {
      expect(screen.getByTestId('import-error')).toHaveTextContent(/incorrect master password/i);
    });
  });

  it('shows a format error for a corrupt file', async () => {
    await seedVault();
    mockFileSystem.__setNextPickedFile({ name: 'not-a-vault.flbx', content: Buffer.from('not a real flbx file') });

    await renderUnlockedScreen(ImportScreen, undefined, 'pick-file-button');
    await fireEvent.press(screen.getByTestId('pick-file-button'));
    await waitFor(() => expect(screen.getByTestId('picked-file-name')).toBeTruthy());

    await fireEvent.changeText(screen.getByTestId('import-password'), TEST_PASSWORD.toString('utf8'));
    await fireEvent.press(screen.getByTestId('preview-button'));

    await waitFor(() => {
      expect(screen.getByTestId('import-error')).toBeTruthy();
    });
  });
});
