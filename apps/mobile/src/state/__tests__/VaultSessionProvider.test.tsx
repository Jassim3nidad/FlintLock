jest.mock('../../crypto/native');
jest.mock('../../storage/native');
jest.mock('../../biometric/native');
jest.mock('../../clipboard/native');
jest.mock('../../preferences/native');

import React from 'react';
import { Text } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import { act } from 'react-test-renderer';
import { Buffer, VaultStore } from '@flintlock/core';
import { vaultStorage } from '../../storage/native';
import { useVaultSession, VaultSessionProvider } from '../VaultSessionProvider';
import { configureNativeTestPlatform } from '../../testUtils/configureNativePlatform';

const FAST_KDF = { kdf: 'pbkdf2' as const, iterations: 100, digest: 'sha256' as const };

beforeEach(() => {
  configureNativeTestPlatform();
  vaultStorage.clearAll();
});

afterEach(() => {
  // An unlocked session leaves a pending real-timer auto-lock scheduled;
  // lock() cancels it so Jest can exit cleanly.
  capturedCtx?.session.lock();
});

function Probe() {
  const { isUnlocked, vaultExists } = useVaultSession();
  return (
    <Text testID="probe">
      {vaultExists ? 'exists' : 'no-vault'}:{isUnlocked ? 'unlocked' : 'locked'}
    </Text>
  );
}

let capturedCtx: ReturnType<typeof useVaultSession> | undefined;
function Capture() {
  capturedCtx = useVaultSession();
  return <Probe />;
}

async function renderCapture() {
  capturedCtx = undefined;
  await render(
    <VaultSessionProvider>
      <Capture />
    </VaultSessionProvider>
  );
}

describe('VaultSessionProvider', () => {
  it('reports no vault and locked before anything happens', async () => {
    await render(
      <VaultSessionProvider>
        <Probe />
      </VaultSessionProvider>
    );
    expect(screen.getByTestId('probe')).toHaveTextContent('no-vault:locked');
  });

  it('createVault transitions to exists + unlocked', async () => {
    await renderCapture();

    await act(async () => {
      await capturedCtx!.createVault(Buffer.from('correct horse'), FAST_KDF);
    });

    expect(screen.getByTestId('probe')).toHaveTextContent('exists:unlocked');
  });

  it('unlockWithPassword transitions to unlocked for an existing vault', async () => {
    // Create the vault out of band first (simulating a prior app run).
    await VaultStore.create(Buffer.from('correct horse'), FAST_KDF);

    await renderCapture();
    expect(screen.getByTestId('probe')).toHaveTextContent('exists:locked');

    await act(async () => {
      await capturedCtx!.unlockWithPassword(Buffer.from('correct horse'));
    });
    expect(screen.getByTestId('probe')).toHaveTextContent('exists:unlocked');
  });

  it('a wrong password rejects and leaves the session locked', async () => {
    await VaultStore.create(Buffer.from('correct horse'), FAST_KDF);
    await renderCapture();

    await expect(
      act(async () => {
        await capturedCtx!.unlockWithPassword(Buffer.from('wrong password'));
      })
    ).rejects.toThrow();
    expect(screen.getByTestId('probe')).toHaveTextContent('exists:locked');
  });

  it('lock() flips isUnlocked back to false', async () => {
    await renderCapture();

    await act(async () => {
      await capturedCtx!.createVault(Buffer.from('pw'), FAST_KDF);
    });
    expect(screen.getByTestId('probe')).toHaveTextContent(/:unlocked$/);

    act(() => {
      capturedCtx!.lock();
    });
    expect(screen.getByTestId('probe')).toHaveTextContent(/:locked$/);
  });
});
