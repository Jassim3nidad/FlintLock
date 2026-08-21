import React from 'react';
import { render, screen, waitFor } from '@testing-library/react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Buffer } from '../crypto';
import { VaultStore } from '../storage/vaultStore';
import { useVaultSession, VaultSessionProvider } from '../state/VaultSessionProvider';
import { ThemeProvider } from '../theme/ThemeProvider';

export const TEST_PASSWORD = Buffer.from('pw');
export const FAST_KDF = { kdf: 'pbkdf2' as const, iterations: 100, digest: 'sha256' as const };

const Stack = createNativeStackNavigator();

/**
 * Renders `Screen` inside the same VaultSessionProvider tree production
 * uses, having already unlocked it. A standalone `new UnlockSession()`
 * unlocked separately would hold a *different* DEK than the one the
 * screen's own useVaultSession() reads — this bootstraps through the
 * exact same context instance instead.
 *
 * Callers that need existing vault data present should seed it directly
 * through a throwaway `VaultStore` instance (same underlying MMKV
 * storage) *before* calling this, then call VaultStore.create() will
 * throw if the vault already exists — so seed with VaultStore.create()
 * once, `.lock()` it, and let this helper's own unlockWithPassword()
 * open the same persisted vault.
 */
export async function renderUnlockedScreen<P extends object>(
  Screen: React.ComponentType,
  params: P | undefined,
  waitForTestId: string
) {
  function Bootstrap() {
    const { session, unlockWithPassword } = useVaultSession();
    React.useEffect(() => {
      if (!session.isUnlocked) {
        unlockWithPassword(TEST_PASSWORD).catch(() => {});
      }
    }, [session, unlockWithPassword]);

    if (!session.isUnlocked) return null;
    return (
      <NavigationContainer>
        <Stack.Navigator>
          <Stack.Screen name="UnderTest" component={Screen} initialParams={params} />
        </Stack.Navigator>
      </NavigationContainer>
    );
  }

  await render(
    <ThemeProvider>
      <VaultSessionProvider>
        <Bootstrap />
      </VaultSessionProvider>
    </ThemeProvider>
  );
  await waitFor(() => {
    expect(screen.getByTestId(waitForTestId)).toBeTruthy();
  });
}

/** Creates a vault with the standard test password/KDF and locks it, leaving it ready for renderUnlockedScreen() to open. */
export async function seedVault(): Promise<VaultStore> {
  const store = await VaultStore.create(TEST_PASSWORD, FAST_KDF);
  return store;
}
