jest.mock('../../crypto/native');
jest.mock('../../storage/native');
jest.mock('../../biometric/native');
jest.mock('../../preferences/native');
jest.mock('../../clipboard/native');

import { render, screen, waitFor, fireEvent } from '@testing-library/react-native';
import { NavigationContainer } from '@react-navigation/native';
import { Buffer } from '../../crypto';
import { vaultStorage } from '../../storage/native';
import { VaultStore } from '../../storage/vaultStore';
import { ThemeProvider } from '../../theme/ThemeProvider';
import { VaultSessionProvider } from '../../state/VaultSessionProvider';
import { RootNavigator } from '../RootNavigator';

const FAST_KDF = { kdf: 'pbkdf2' as const, iterations: 100, digest: 'sha256' as const };

async function renderRoot() {
  return render(
    <ThemeProvider>
      <VaultSessionProvider>
        <NavigationContainer>
          <RootNavigator />
        </NavigationContainer>
      </VaultSessionProvider>
    </ThemeProvider>
  );
}

beforeEach(() => {
  vaultStorage.clearAll();
});

describe('RootNavigator', () => {
  it('shows CreateVaultScreen when no vault exists', async () => {
    await renderRoot();
    expect(screen.getByTestId('no-recovery-warning')).toBeTruthy();
  });

  it('shows UnlockScreen when a vault exists but is locked', async () => {
    await VaultStore.create(Buffer.from('pw'), FAST_KDF);
    await renderRoot();
    await waitFor(() => {
      expect(screen.getByTestId('unlock-button')).toBeTruthy();
    });
  });

  it('shows the main vault (VaultListScreen) once unlocked', async () => {
    await VaultStore.create(Buffer.from('pw'), FAST_KDF);
    await renderRoot();
    await waitFor(() => screen.getByTestId('unlock-button'));

    await fireEvent.changeText(screen.getByTestId('password-input'), 'pw');
    await fireEvent.press(screen.getByTestId('unlock-button'));

    await waitFor(() => {
      expect(screen.getByTestId('search-input')).toBeTruthy();
    });
  });
});
