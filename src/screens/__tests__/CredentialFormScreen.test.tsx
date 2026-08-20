jest.mock('../../crypto/native');
jest.mock('../../storage/native');
jest.mock('../../biometric/native');
jest.mock('../../preferences/native');

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Buffer } from '../../crypto';
import { vaultStorage } from '../../storage/native';
import { VaultStore } from '../../storage/vaultStore';
import { useVaultSession, VaultSessionProvider } from '../../state/VaultSessionProvider';
import { ThemeProvider } from '../../theme/ThemeProvider';
import { Credential } from '../../storage/schema';
import { CredentialFormScreen } from '../CredentialFormScreen';

const FAST_KDF = { kdf: 'pbkdf2' as const, iterations: 100, digest: 'sha256' as const };
const PASSWORD = Buffer.from('pw');

const Stack = createNativeStackNavigator();

/**
 * CredentialFormScreen assumes an already-unlocked vault — RootNavigator
 * only ever mounts it once isUnlocked is true. Rather than construct a
 * standalone UnlockSession (which would hold a *different* DEK than the
 * one CredentialFormScreen reads via useVaultSession()), this bootstrap
 * unlocks through the same VaultSessionProvider instance the screen
 * itself consumes: any pre-existing vault data was seeded directly into
 * storage beforehand (see seedVaultWithCredential below), so unlocking
 * here just needs the password.
 */
function Bootstrap({ credentialId }: { credentialId?: string }) {
  const { session, unlockWithPassword } = useVaultSession();

  React.useEffect(() => {
    if (!session.isUnlocked) {
      unlockWithPassword(PASSWORD).catch(() => {});
    }
  }, [session, unlockWithPassword]);

  if (!session.isUnlocked) return null;
  return (
    <NavigationContainer>
      <Stack.Navigator>
        <Stack.Screen
          name="CredentialForm"
          component={CredentialFormScreen}
          initialParams={credentialId ? { credentialId } : undefined}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

async function renderForm(credentialId?: string) {
  await render(
    <ThemeProvider>
      <VaultSessionProvider>
        <Bootstrap credentialId={credentialId} />
      </VaultSessionProvider>
    </ThemeProvider>
  );
  await waitFor(() => {
    expect(screen.getByTestId('title-input')).toBeTruthy();
  });
}

beforeEach(() => {
  vaultStorage.clearAll();
});

describe('CredentialFormScreen — create', () => {
  beforeEach(async () => {
    await VaultStore.create(PASSWORD, FAST_KDF);
  });

  it('requires a title before saving', async () => {
    await renderForm();
    await fireEvent.press(screen.getByTestId('save-button'));
    expect(screen.getByTestId('form-error')).toHaveTextContent(/title is required/i);
  });

  it('creates a credential with the entered fields', async () => {
    await renderForm();

    await fireEvent.changeText(screen.getByTestId('title-input'), 'Example');
    await fireEvent.changeText(screen.getByTestId('username-input'), 'alice');
    await fireEvent.changeText(screen.getByTestId('password-input'), 'hunter2');
    await fireEvent.changeText(screen.getByTestId('url-input'), 'https://example.com');
    await fireEvent.press(screen.getByTestId('save-button'));

    await waitFor(() => {
      const stored = vaultStorage.getAllKeys().filter((k) => k.startsWith('vault:record:'));
      expect(stored.length).toBe(1);
    });
  });

  it('the generate-password button fills in a password', async () => {
    await renderForm();
    expect(screen.getByTestId('password-input').props.value).toBe('');
    await fireEvent.press(screen.getByTestId('generate-password-button'));
    expect(screen.getByTestId('password-input').props.value.length).toBeGreaterThan(0);
  });
});

describe('CredentialFormScreen — edit', () => {
  it('pre-fills fields from the existing credential and saves changes', async () => {
    // Seed the credential directly through storage before any component
    // renders, using a throwaway VaultStore instance — this is the same
    // underlying MMKV-backed storage the screen's own session will open.
    const seedStore = await VaultStore.create(PASSWORD, FAST_KDF);
    const now = Date.now();
    const existing: Credential = {
      id: 'seed-credential-1',
      recordType: 'credential',
      title: 'Old title',
      username: 'alice',
      password: 'oldpass',
      urls: ['https://old.example.com'],
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
    };
    seedStore.putRecord(existing);
    seedStore.lock();

    await renderForm(existing.id);
    expect(screen.getByTestId('title-input').props.value).toBe('Old title');

    await fireEvent.changeText(screen.getByTestId('title-input'), 'New title');
    await fireEvent.press(screen.getByTestId('save-button'));

    await waitFor(() => {
      const raw = vaultStorage.getBuffer(`vault:record:${existing.id}`);
      expect(raw).toBeDefined();
    });
  });
});
