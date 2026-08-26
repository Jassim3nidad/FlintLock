jest.mock('../../crypto/native');
jest.mock('../../storage/native');
jest.mock('../../biometric/native');
jest.mock('../../clipboard/native');
jest.mock('../../preferences/native');

import React from 'react';
import { Text } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import { act } from 'react-test-renderer';
import { Buffer } from '@flintlock/core';
import { vaultStorage } from '../../storage/native';
import { useVaultSession, VaultSessionProvider } from '../VaultSessionProvider';
import { configureNativeTestPlatform } from '../../testUtils/configureNativePlatform';
import { fromKeyHandle } from '../../crypto/keyHandleInterop';

const FAST_KDF = { kdf: 'pbkdf2' as const, iterations: 100, digest: 'sha256' as const };

beforeEach(() => {
  configureNativeTestPlatform();
  vaultStorage.clearAll();
});

/**
 * Verifies the F1 unmount-lock fix (VaultSessionProvider's `useEffect(() =>
 * () => session.lock(), [session])`) is safe under React 18/19 StrictMode's
 * development-only "mount, synthetically unmount+remount effects once"
 * behavior — the concern being: does that synthetic double-invoke fire the
 * new cleanup while a vault is unlocked, locking the user out mid-session?
 *
 * It shouldn't, by React's own documented semantics: the double-invoke is
 * tied to the *initial* commit, happens synchronously as part of that first
 * mount, and only re-fires on a real unmount thereafter (the effect's only
 * dependency, `session`, is a stable ref that never changes across
 * re-renders). Nothing has had a chance to unlock anything by the time that
 * synthetic cycle completes. This test exercises that directly rather than
 * relying on the reasoning alone.
 *
 * The second test below asserts the DEK's actual bytes are zeroed on
 * unmount — via `VaultStore.unsafeDekForTests()` + `fromKeyHandle()`, the
 * same pattern `bridgeSession.test.ts`'s "zeroes the session key" test
 * uses — not just that `isUnlocked` flips to `false`. `isUnlocked` is a
 * state flag (`this.store !== null`) that `lock()` always sets regardless
 * of whether `disposeKey()` actually ran; a test that only checked the
 * flag would keep passing even with `disposeKey()` deleted from
 * `VaultStore.lock()` entirely — confirmed by deliberately deleting it and
 * watching only the byte-level assertion fail.
 */
let capturedCtx: ReturnType<typeof useVaultSession> | undefined;
function Capture() {
  capturedCtx = useVaultSession();
  return (
    <Text testID="probe">{capturedCtx.vaultExists ? 'exists' : 'no-vault'}:{capturedCtx.isUnlocked ? 'unlocked' : 'locked'}</Text>
  );
}

describe('VaultSessionProvider under React.StrictMode', () => {
  it('does not lock a session unlocked well after the initial mount settles', async () => {
    capturedCtx = undefined;
    await render(
      <React.StrictMode>
        <VaultSessionProvider>
          <Capture />
        </VaultSessionProvider>
      </React.StrictMode>
    );

    // The mount + StrictMode double-invoke cycle has fully settled by this
    // point (it's synchronous, tied to the first commit) — nothing was
    // unlocked during it, so this should always read locked here.
    expect(screen.getByTestId('probe')).toHaveTextContent('no-vault:locked');

    await act(async () => {
      await capturedCtx!.createVault(Buffer.from('strict-mode-pw'), FAST_KDF);
    });

    // The real assertion: unlocking *after* StrictMode's synthetic
    // mount/unmount/remount cycle has already run must not be undone by
    // anything left over from that cycle.
    expect(screen.getByTestId('probe')).toHaveTextContent('exists:unlocked');
    expect(capturedCtx!.session.isUnlocked).toBe(true);

    act(() => {
      capturedCtx!.session.lock();
    });
  });

  it('a genuine remount under StrictMode (simulating Fast Refresh replacing the provider instance) starts the new instance locked, and zeroes the old instance\'s key rather than leaking it', async () => {
    capturedCtx = undefined;
    const view = await render(
      <React.StrictMode>
        <VaultSessionProvider>
          <Capture />
        </VaultSessionProvider>
      </React.StrictMode>
    );

    await act(async () => {
      await capturedCtx!.createVault(Buffer.from('strict-mode-pw-3'), FAST_KDF);
    });
    const oldSession = capturedCtx!.session;
    expect(oldSession.isUnlocked).toBe(true);

    // Captured *before* teardown, deliberately, for the same reason
    // bridgeSession.test.ts's "zeroes the session key" test captures its
    // key first: isUnlocked() is a state flag (this.store !== null on
    // UnlockSession) that lock() always flips regardless of whether
    // disposeKey() actually ran — asserting only that flag would keep
    // passing even if disposeKey() were deleted from VaultStore.lock()
    // entirely. The actual guarantee this test exists to prove is that
    // the DEK's *bytes* get zeroed, not just that a reference becomes
    // unreachable.
    const dekHandle = oldSession.vault.unsafeDekForTests();
    expect(dekHandle).not.toBeNull();

    // A real unmount — what Fast Refresh does when it decides a component
    // can't be hot-patched in place and remounts the tree instead.
    // useEffect cleanups are *passive* effects: React does not guarantee
    // they've run synchronously the instant unmount() returns, only that
    // they're scheduled — wrapping in act() is what forces them to flush
    // before the next line runs, same as it does for passive effect
    // *setup* on mount. Calling unmount() bare and asserting immediately
    // after is exactly the kind of gap that produced the original flake;
    // don't repeat that mistake while testing the fix for it.
    await act(async () => {
      view.unmount();
    });

    // The state-flag check (kept, since it's still a real, separate
    // observable behavior)...
    expect(oldSession.isUnlocked).toBe(false);
    // ...and the actual memory-hygiene guarantee: the same underlying
    // bytes captured above are now zeroed in place, not just replaced by
    // a new null reference.
    expect(fromKeyHandle(dekHandle!).every((byte: number) => byte === 0)).toBe(true);

    // A fresh mount afterward (what the developer sees post-refresh) is a
    // brand-new provider with its own brand-new session — this was already
    // true before the fix (a fresh sessionRef.current on remount), and
    // still is: Fast Refresh always presents a locked screen after
    // replacing the provider, with or without this fix. The fix only
    // changes whether the *abandoned* instance's key material lingers.
    // (Vault storage itself persists across the remount — a real vault was
    // created above — so the fresh session correctly reports the vault as
    // existing, just not unlocked by *this* instance.)
    capturedCtx = undefined;
    const secondView = await render(
      <React.StrictMode>
        <VaultSessionProvider>
          <Capture />
        </VaultSessionProvider>
      </React.StrictMode>
    );
    expect(screen.getAllByTestId('probe')[0]).toHaveTextContent('exists:locked');
    expect(capturedCtx!.session).not.toBe(oldSession);

    await act(async () => {
      secondView.unmount();
    });
  });

  it('measures the real gap: how long after a bare (non-act-wrapped) unmount does the cleanup actually take effect', async () => {
    capturedCtx = undefined;
    const view = await render(
      <VaultSessionProvider>
        <Capture />
      </VaultSessionProvider>
    );
    await act(async () => {
      await capturedCtx!.createVault(Buffer.from('strict-mode-pw-4'), FAST_KDF);
    });
    const oldSession = capturedCtx!.session;
    expect(oldSession.isUnlocked).toBe(true);

    view.unmount(); // deliberately NOT act()-wrapped, to observe the real gap

    const immediatelyAfter = oldSession.isUnlocked;
    // Flush microtasks/macrotasks without React's act() forcing anything,
    // to see how long the real gap is under Jest's fake-vs-real timer
    // setup — this app's tests run with Jest's default (real) timers.
    await new Promise((resolve) => setTimeout(resolve, 0));
    const afterOneTick = oldSession.isUnlocked;

console.log(`[StrictMode/unmount timing] immediately after unmount(): isUnlocked=${immediatelyAfter}; after one setTimeout(0) tick: isUnlocked=${afterOneTick}`);

    expect(afterOneTick).toBe(false);
  });
});
