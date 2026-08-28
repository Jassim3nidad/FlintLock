import { Buffer } from 'buffer';
import { configureTestPlatform, resetPlatformForTests, TestPlatform } from '../../testing/configureTestPlatform';
import { VaultStore } from '../../storage/vaultStore';
import { UnlockSession } from '../../unlock/session';
import { SessionClipboardGuard } from '../sessionClipboardGuard';

const FAST_KDF = { kdf: 'pbkdf2' as const, iterations: 100, digest: 'sha256' as const };
const PASSWORD = Buffer.from('correct horse battery staple');

let platform: TestPlatform;
let session: UnlockSession;
let guard: SessionClipboardGuard;

beforeEach(async () => {
  platform = configureTestPlatform();
  const store = await VaultStore.create(PASSWORD, FAST_KDF);
  await store.updateSettings({ lockOnBackground: true });
  store.lock();

  session = new UnlockSession();
  await session.unlockWithPassword(PASSWORD);
  guard = new SessionClipboardGuard(session);
});

afterEach(async () => {
  // clipboardManager.copy() starts a real 1s-tick setInterval (default
  // clearAfterSeconds=30) that only ClipboardManager.clear() itself is
  // guaranteed to stop. Relying on session.lock() to reach it via
  // guard.handleLock() is not enough by itself — several tests either
  // lock the session before copying again (a no-op relock, since
  // UnlockSession.lock() only fires listeners when wasUnlocked) or call
  // guard.dispose() first (severing that path entirely), either of
  // which would otherwise leave a live interval ticking for up to 30
  // real seconds past the end of the test, stalling the whole file.
  await guard.clipboardManager.clear().catch(() => {});
  guard.dispose();
  session.lock();
  resetPlatformForTests();
});

describe('SessionClipboardGuard — leg 1 (clear on lock)', () => {
  it('clears the clipboard the moment the session locks, for any lock reason', async () => {
    await guard.clipboardManager.copy('hunter2');
    session.lock('background');
    await Promise.resolve();
    await Promise.resolve();

    expect(await platform.clipboard.read()).toBe('');
  });
});

describe('SessionClipboardGuard — leg 2 (verify on foreground)', () => {
  it('is a pure mock-verified case: on a normal foreground with no prior lock, does not touch the clipboard at all', async () => {
    await guard.clipboardManager.copy('hunter2');
    // No lock happened — this models an ordinary foreground transition
    // while a just-copied value is still legitimately on the clipboard.
    await guard.handleForeground();

    expect(await platform.clipboard.read()).toBe('hunter2');
  });

  it('mock-verified: recovers silently when the lock-time clear was silently denied (Android background-focus denial) and the retry on foreground succeeds', async () => {
    await guard.clipboardManager.copy('hunter2');

    // Model the real Android 10+ failure this leg exists for: the app is
    // backgrounded when session.lock() clears the clipboard, so the
    // platform silently denies the write (write() reports success, the
    // content doesn't change) — this is exactly what
    // apps/mobile/src/clipboard/__mocks__/native.ts's __setFocused(false)
    // models at the native-writer layer; here it's modeled directly at
    // the StubClipboardWriter layer that ClipboardManager talks to.
    platform.clipboard.silentlyDenyNextWrite = true;
    session.lock('background');
    await Promise.resolve();
    await Promise.resolve();
    expect(await platform.clipboard.read()).toBe('hunter2'); // clear() believed it worked

    let warningFired = false;
    guard.onWarningChange((active) => {
      if (active) warningFired = true;
    });

    // Foreground is back — the retry write is no longer denied.
    await guard.handleForeground();

    expect(await platform.clipboard.read()).toBe('');
    expect(guard.isWarningActive).toBe(false);
    expect(warningFired).toBe(false);
  });

  it('does not re-verify on a second foreground once a lock has already been verified', async () => {
    await guard.clipboardManager.copy('hunter2');
    session.lock('background');
    await Promise.resolve();
    await guard.handleForeground();
    expect(await platform.clipboard.read()).toBe('');

    // A later, unrelated copy + foreground shouldn't be wiped by a stale
    // pendingVerification flag.
    await guard.clipboardManager.copy('still-here');
    await guard.handleForeground();
    expect(await platform.clipboard.read()).toBe('still-here');
  });
});

describe('SessionClipboardGuard — leg 3 (warning survives the backgrounded gap, without leaking content)', () => {
  it('mock-verified: raises a persistent, generic warning when the retry itself still fails on foreground', async () => {
    await guard.clipboardManager.copy('hunter2');

    // Sustained denial: both the lock-time clear and the foreground retry
    // are denied — the case a device might plausibly hit if it comes back
    // to foreground with focus still contested.
    platform.clipboard.silentlyDenyNextWrite = true;
    session.lock('background');
    await Promise.resolve();
    await Promise.resolve();

    platform.clipboard.silentlyDenyNextWrite = true;
    expect(guard.isWarningActive).toBe(false);

    await guard.handleForeground();

    expect(guard.isWarningActive).toBe(true);
    // Non-disclosure here isn't something a runtime assertion can prove —
    // it's structural: SessionClipboardGuard's constructor never receives
    // the copied value in the first place (ClipboardManager.copy() is
    // called by screens directly, not routed through this class), so
    // there is no field for it to hold or leak. See this file's own
    // doc comment.
  });

  it('the warning is persistent state, not a one-shot event — still true after the failing moment has passed', async () => {
    await guard.clipboardManager.copy('hunter2');
    platform.clipboard.silentlyDenyNextWrite = true;
    session.lock('background');
    await Promise.resolve();
    await Promise.resolve();
    platform.clipboard.failNextWrite = true;
    await guard.handleForeground();

    expect(guard.isWarningActive).toBe(true);
    // Time passes, other unrelated activity happens...
    await Promise.resolve();
    await Promise.resolve();
    expect(guard.isWarningActive).toBe(true);
  });

  it('dismissWarning() clears the warning without affecting the clipboard', async () => {
    await guard.clipboardManager.copy('hunter2');
    platform.clipboard.silentlyDenyNextWrite = true;
    session.lock('background');
    await Promise.resolve();
    await Promise.resolve();
    platform.clipboard.failNextWrite = true;
    await guard.handleForeground();
    expect(guard.isWarningActive).toBe(true);

    guard.dismissWarning();

    expect(guard.isWarningActive).toBe(false);
  });

  it('a later successful clear+verify cycle can turn the warning back off', async () => {
    await guard.clipboardManager.copy('hunter2');
    platform.clipboard.silentlyDenyNextWrite = true;
    session.lock('background');
    await Promise.resolve();
    await Promise.resolve();
    platform.clipboard.failNextWrite = true;
    await guard.handleForeground();
    expect(guard.isWarningActive).toBe(true);

    // A fresh unlock/lock/foreground cycle that succeeds this time.
    await session.unlockWithPassword(PASSWORD);
    await guard.clipboardManager.copy('new-value');
    session.lock('background');
    await Promise.resolve();
    await Promise.resolve();
    await guard.handleForeground();

    expect(guard.isWarningActive).toBe(false);
  });
});

describe('SessionClipboardGuard — dispose', () => {
  it('unsubscribes from session.onLock() so a later lock no longer triggers a clear', async () => {
    guard.dispose();
    await guard.clipboardManager.copy('hunter2');
    session.lock('background');
    await Promise.resolve();
    await Promise.resolve();

    expect(await platform.clipboard.read()).toBe('hunter2');
  });
});
