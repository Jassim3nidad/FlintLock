jest.mock('../../crypto/native');
jest.mock('../../storage/native');
jest.mock('../../biometric/native');
jest.mock('../../clipboard/native');
jest.mock('../../preferences/native');

import React from 'react';
import { AppState, Text } from 'react-native';
import { render, screen, waitFor } from '@testing-library/react-native';
import { act } from 'react-test-renderer';
import { Buffer } from '@flintlock/core';
import { vaultStorage } from '../../storage/native';
import { Clipboard } from '../../clipboard/native';
import { useVaultSession, VaultSessionProvider } from '../VaultSessionProvider';
import { configureNativeTestPlatform } from '../../testUtils/configureNativePlatform';

/**
 * Integration test for the piece none of this feature's other test files
 * cover: that VaultSessionProvider's real AppState wiring actually drives
 * SessionClipboardGuard end to end, through the native clipboard mock's
 * focus-gating — not just that SessionClipboardGuard's own logic is
 * correct in isolation (see packages/core/src/clipboard/__tests__/
 * sessionClipboardGuard.test.ts for that) and not just that
 * nativeClipboardWriter forwards read()/write() correctly (see
 * nativeClipboardWriter.test.ts). Those two are necessary but not
 * sufficient: this is the file that would catch a wiring mistake in
 * VaultSessionProvider itself (wrong event, wrong ordering relative to
 * session.handleAppForegrounded(), guard never constructed, etc).
 *
 * jest.requireMock is needed for the same reason
 * nativeBiometricKeySource.test.ts uses it: jest.mock('../../clipboard/native')
 * and a direct import of the __mocks__ file load as two independent
 * module instances.
 */
const mockClipboardNative = jest.requireMock<typeof import('../../clipboard/__mocks__/native')>(
  '../../clipboard/native'
);

const FAST_KDF = { kdf: 'pbkdf2' as const, iterations: 100, digest: 'sha256' as const };

beforeEach(() => {
  configureNativeTestPlatform();
  vaultStorage.clearAll();
  mockClipboardNative.__reset();
  (AppState.addEventListener as jest.Mock).mockClear();
});

afterEach(() => {
  capturedCtx?.session.lock();
});

function Probe() {
  const { isClipboardWarningActive } = useVaultSession();
  return <Text testID="warning">{isClipboardWarningActive ? 'warning' : 'no-warning'}</Text>;
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
  await waitFor(() => {
    expect(capturedCtx).toBeDefined();
  });
}

/** Finds the 'change' handler VaultSessionProvider registered with AppState.addEventListener and invokes it, the same way the real native module would. */
async function fireAppStateChange(status: 'active' | 'background') {
  const mockAddEventListener = AppState.addEventListener as jest.Mock;
  const call = mockAddEventListener.mock.calls.find(([type]) => type === 'change');
  if (!call) throw new Error("VaultSessionProvider never registered an AppState 'change' listener");
  await act(async () => {
    call[1](status);
    // handleForeground() is fire-and-forget from the listener's
    // perspective (VaultSessionProvider catches its rejection but doesn't
    // await it) — flush the microtask queue so its internal read()/write()
    // awaits actually settle before assertions run.
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    if (status === 'active') {
      // SessionClipboardGuard.handleForeground() doesn't trust a first
      // "cleared" read alone — it re-checks once more after a real
      // foregroundConfirmationDelayMs (500ms default here, since
      // VaultSessionProvider constructs the guard with no override — see
      // that class's own doc comment on why). Flushing microtasks can't
      // span a real macrotask delay, so wait past it too. A no-op wait
      // when pendingVerification was never set (nothing scheduled).
      await new Promise((resolve) => setTimeout(resolve, 650));
    }
  });
}

describe('VaultSessionProvider + SessionClipboardGuard — real AppState wiring', () => {
  it('mock-verified: a value copied while foregrounded, then app backgrounds and loses clipboard focus before the lock-time clear runs — recovers silently once foreground returns, no warning', async () => {
    await renderCapture();
    await act(async () => {
      await capturedCtx!.createVault(Buffer.from('correct horse'), FAST_KDF);
    });

    await act(async () => {
      await capturedCtx!.clipboardManager.copy('hunter2');
    });
    expect(await Clipboard.getString()).toBe('hunter2');

    // App loses foreground focus — from this point on, real Android 10+
    // silently denies clipboard writes, which is exactly what
    // __setFocused(false) models at the native-module boundary.
    mockClipboardNative.__setFocused(false);

    // lockOnBackground defaults to true, so this locks the session, which
    // fires session.onLock() -> SessionClipboardGuard.handleLock() ->
    // clipboardManager.clear() — attempted while still unfocused, so it's
    // silently denied and the clipboard doesn't actually change yet.
    await fireAppStateChange('background');
    expect(capturedCtx!.isUnlocked).toBe(false);
    // Still unfocused here, so Clipboard.getString() itself would be
    // gated too (real Android denies reads the same way it denies
    // writes) — __peek() bypasses that to assert ground truth: the
    // "successful" clear from handleLock() never actually landed.
    expect(mockClipboardNative.__peek()).toBe('hunter2');

    // Focus returns before the app is foregrounded again (e.g. the user
    // re-opens the app after switching away).
    mockClipboardNative.__setFocused(true);
    await fireAppStateChange('active');

    expect(await Clipboard.getString()).toBe('');
    expect(screen.getByTestId('warning')).toHaveTextContent('no-warning');
    expect(capturedCtx!.isClipboardWarningActive).toBe(false);
  });

  /**
   * NOT a demonstration that the warning leg works — the opposite. This
   * documents the residual limit of `SessionClipboardGuard`'s foreground
   * confirmation re-check (see that class's doc comment), not something
   * being asserted as correct or desired: see docs/AUDIT-2026-08-25.md's
   * F2 write-up for the full explanation and the question left open for
   * the user (whether this race is reachable on real hardware at all,
   * and if so, whether it's worth closing further).
   *
   * `ClipboardManager.verifyCleared()` treats `read() === ''` as proof
   * the clipboard is empty. `read()` is focus-gated the same way
   * `write()` is (see clipboard/__mocks__/native.ts and Android's actual
   * documented 10+ restriction, which covers both get and set), so a
   * `read()` performed before clipboard focus has genuinely returned
   * cannot tell "actually empty" apart from "denied, reports empty
   * either way." `handleForeground()` no longer trusts a single such
   * read (it re-checks once more after a real delay — see
   * 'a transient focus-grant lag is exactly what the confirmation
   * re-check exists for' below, where that mitigation succeeds) — but
   * that mitigation is bounded: this test models focus staying denied
   * for the *entire* window, including past the delayed re-check, so
   * both checks come back empty and the false negative still reproduces.
   * Whether real hardware can plausibly stay denied that long, or the
   * lag is always much shorter, is unconfirmed — flagged for real-
   * device verification, not guessed at.
   */
  it('surfaces the confirmation re-check\'s residual limit: sustained denial through the whole window still produces no warning', async () => {
    await renderCapture();
    await act(async () => {
      await capturedCtx!.createVault(Buffer.from('correct horse'), FAST_KDF);
    });

    await act(async () => {
      await capturedCtx!.clipboardManager.copy('hunter2');
    });

    mockClipboardNative.__setFocused(false);
    await fireAppStateChange('background');
    expect(mockClipboardNative.__peek()).toBe('hunter2');

    // AppState fires 'active' while the clipboard focus-gate is still
    // denied — see this test's header comment on why this specific
    // desync is unconfirmed as a real-hardware possibility.
    await fireAppStateChange('active');

    // Ground truth: the clipboard was never actually cleared.
    expect(mockClipboardNative.__peek()).toBe('hunter2');
    // Observed behavior: verifyCleared()'s read() came back '' (gated,
    // not genuinely empty), so it reported success and no warning fired
    // — a false negative, not a caught failure.
    expect(screen.getByTestId('warning')).toHaveTextContent('no-warning');
    expect(capturedCtx!.isClipboardWarningActive).toBe(false);

    // Once focus genuinely returns, a later foreground/verify cycle
    // would still never revisit this: pendingVerification was already
    // consumed by the false-negative pass above.
    mockClipboardNative.__setFocused(true);
    await fireAppStateChange('active');
    expect(capturedCtx!.isClipboardWarningActive).toBe(false);
    expect(mockClipboardNative.__peek()).toBe('hunter2'); // still sitting there, unwarned
  });

  it("a transient focus-grant lag is exactly what the confirmation re-check exists for: focus restores mid-delay, and the retry recovers silently instead of falsely reporting cleared", async () => {
    await renderCapture();
    await act(async () => {
      await capturedCtx!.createVault(Buffer.from('correct horse'), FAST_KDF);
    });

    await act(async () => {
      await capturedCtx!.clipboardManager.copy('hunter2');
    });

    mockClipboardNative.__setFocused(false);
    await fireAppStateChange('background');
    expect(mockClipboardNative.__peek()).toBe('hunter2');

    // Focus is still denied at the exact moment AppState fires 'active'
    // (so the guard's first check reads '' and can't trust it alone),
    // but genuinely restores 200ms later — well inside the 500ms
    // confirmation delay `fireAppStateChange`'s real wait already spans.
    // This is the case the fix exists for: real hardware might plausibly
    // restore clipboard focus within a few hundred ms of 'active' (an
    // animation finishing, a dialog dismissing), even if it can't do so
    // instantly.
    mockClipboardNative.__setFocusedAfter(200, true);
    await fireAppStateChange('active');

    expect(mockClipboardNative.__peek()).toBe('');
    expect(screen.getByTestId('warning')).toHaveTextContent('no-warning');
    expect(capturedCtx!.isClipboardWarningActive).toBe(false);
  });

  it('an ordinary foreground with no prior lock does not touch a clipboard value that is still legitimately within its 30s window', async () => {
    await renderCapture();
    await act(async () => {
      await capturedCtx!.createVault(Buffer.from('correct horse'), FAST_KDF);
    });

    await act(async () => {
      await capturedCtx!.clipboardManager.copy('hunter2');
    });

    // Foreground fires with no lock having happened in between — e.g. a
    // permission dialog briefly took focus. This must not be mistaken for
    // the post-lock verification case.
    await fireAppStateChange('active');

    expect(await Clipboard.getString()).toBe('hunter2');
    expect(capturedCtx!.isClipboardWarningActive).toBe(false);
  });
});
