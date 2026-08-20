jest.mock('../../crypto/native');
jest.mock('../../storage/native');
jest.mock('../../biometric/native');
jest.mock('../../preferences/native');
jest.mock('../../files/native');

import { screen, fireEvent, waitFor } from '@testing-library/react-native';
import { Buffer } from '../../crypto';
import { vaultStorage } from '../../storage/native';
import { renderUnlockedScreen, seedVault, TEST_PASSWORD } from '../../testUtils/renderUnlockedScreen';
import { ExportScreen } from '../ExportScreen';

// jest.mock('../../files/native') and a direct import of the __mocks__
// module load as two independent module instances — jest.requireMock is
// the only way to reach the exact instance ExportScreen.tsx is using.
const mockFileSystem = jest.requireMock<typeof import('../../files/__mocks__/native')>('../../files/native');

beforeEach(() => {
  vaultStorage.clearAll();
  mockFileSystem.__reset();
});

describe('ExportScreen', () => {
  it('keeps Export disabled until a password is entered', async () => {
    await seedVault();
    await renderUnlockedScreen(ExportScreen, undefined, 'export-password');

    expect(screen.getByTestId('export-button').props.accessibilityState.disabled).toBe(true);
    await fireEvent.changeText(screen.getByTestId('export-password'), 'pw');
    expect(screen.getByTestId('export-button').props.accessibilityState.disabled).toBe(false);
  });

  it('exports a .flbx backup as base64 through the share sheet', async () => {
    await seedVault();
    await renderUnlockedScreen(ExportScreen, undefined, 'export-password');

    await fireEvent.changeText(screen.getByTestId('export-password'), TEST_PASSWORD.toString('utf8'));
    await fireEvent.press(screen.getByTestId('export-button'));

    await waitFor(() => {
      expect(screen.getByTestId('export-success')).toBeTruthy();
    });
    const calls = mockFileSystem.__getShareCalls();
    expect(calls).toHaveLength(1);
    expect(calls[0]!.dialogTitle).toMatch(/flbx/i);
    expect(() => Buffer.from(calls[0]!.content, 'base64')).not.toThrow();
  });

  it('shows an error for an incorrect master password', async () => {
    await seedVault();
    await renderUnlockedScreen(ExportScreen, undefined, 'export-password');

    await fireEvent.changeText(screen.getByTestId('export-password'), 'wrong password');
    await fireEvent.press(screen.getByTestId('export-button'));

    await waitFor(() => {
      expect(screen.getByTestId('export-error')).toHaveTextContent(/incorrect master password/i);
    });
    expect(mockFileSystem.__getShareCalls()).toHaveLength(0);
  });

  it('requires acknowledging the plaintext-risk warning before a CSV export is enabled', async () => {
    await seedVault();
    await renderUnlockedScreen(ExportScreen, undefined, 'export-password');

    await fireEvent.press(screen.getByTestId('option-csv'));
    expect(screen.getByTestId('plaintext-warning')).toBeTruthy();

    await fireEvent.changeText(screen.getByTestId('export-password'), TEST_PASSWORD.toString('utf8'));
    expect(screen.getByTestId('export-button').props.accessibilityState.disabled).toBe(true);

    await fireEvent(screen.getByTestId('acknowledge-risk-switch'), 'valueChange', true);
    expect(screen.getByTestId('export-button').props.accessibilityState.disabled).toBe(false);

    await fireEvent.press(screen.getByTestId('export-button'));

    await waitFor(() => {
      expect(screen.getByTestId('export-success')).toBeTruthy();
    });
    const calls = mockFileSystem.__getShareCalls();
    expect(calls).toHaveLength(1);
    expect(calls[0]!.content).toContain('title,username,password');
  });
});
