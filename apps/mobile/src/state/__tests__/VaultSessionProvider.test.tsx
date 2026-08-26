jest.mock('../../crypto/native');
jest.mock('../../storage/native');
jest.mock('../../biometric/native');
jest.mock('../../clipboard/native');
jest.mock('../../preferences/native');

import React from 'react';
import { Text } from 'react-native';
import { render, screen, waitFor } from '@testing-library/react-native';
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

/**
 * Waits for the actual rendered output (`capturedCtx` being set), not just
 * for `render()`'s own promise, as defense in depth — kept from an earlier
 * hypothesis in this investigation (`render()` was directly observed
 * resolving before `Capture` had rendered at all, under full-suite CPU
 * load) that turned out not to be the real cause of this file's flake, but
 * is still a real gap worth closing on its own terms; it doesn't hurt.
 *
 * The actual cause, found by reordering tests and confirming the failure
 * moved with the reorder rather than staying pinned to one test: the
 * *previous* test's `await expect(act(async () => {...})).rejects.toThrow()`
 * pattern — letting an async `act()` callback's rejection propagate out of
 * `act()` itself, rather than being caught inside it — left React's act()
 * environment in a state that silently starved whatever render the
 * *next* test tried to do, with no error surfaced anywhere. Fixed at the
 * source: that test now catches inside the `act()` callback instead (see
 * "a wrong password rejects and leaves the session locked" below). Left
 * this `waitFor` in place anyway, since a render that silently never
 * happens is exactly the failure mode this investigation spent the most
 * time chasing, and asserting on the actual output is strictly more
 * honest than trusting `render()`'s promise alone regardless of which
 * specific cause produced this particular flake.
 */
async function renderCapture() {
  capturedCtx = undefined;
  await render(
    <VaultSessionProvider>
      <Capture />
    </VaultSessionProvider>
  );
  await waitFor(() => {
    expect(capturedCtx).toBeDefined();
  });
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

    // Deliberately not `await expect(act(async () => {...})).rejects.toThrow()`
    // — see this file's header comment on why letting `act()`'s own promise
    // reject, rather than catching inside it, was the real cause of a
    // ~25%-of-full-suite-runs flake in whichever test happened to run next.
    let caught: unknown;
    await act(async () => {
      try {
        await capturedCtx!.unlockWithPassword(Buffer.from('wrong password'));
      } catch (e) {
        caught = e;
      }
    });
    expect(caught).toBeInstanceOf(Error);
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
