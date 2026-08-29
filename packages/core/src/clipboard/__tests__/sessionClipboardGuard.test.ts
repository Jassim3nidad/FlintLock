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
  // delay=0: the real default (500ms) exists to hedge against a real
  // device's clipboard-focus-grant lag (see the class's own doc comment)
  // — tests need the confirmation-recheck's *logic*, not the wall-clock
  // wait, or every relevant test would cost real seconds for nothing.
  guard = new SessionClipboardGuard(session, undefined, 0);
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

describe('SessionClipboardGuard — confirmation re-check (AppState "active" vs. Android clipboard-focus grant may not be atomic)', () => {
  it('does NOT trust a first empty read alone: a genuinely denied read followed by a real reveal of leftover content raises the warning, not suppresses it', async () => {
    await guard.clipboardManager.copy('hunter2');

    // Lock-time clear is denied (write silently no-ops) — real content is
    // still 'hunter2'.
    platform.clipboard.silentlyDenyNextWrite = true;
    session.lock('background');
    await Promise.resolve();
    await Promise.resolve();

    // The FIRST read inside handleForeground()'s confirmation check comes
    // back '' — not because the clipboard is actually clear, but because
    // this specific read is the one denied (modeling AppState firing
    // 'active' a moment before Android's clipboard-focus grant catches
    // up). The real content is still there underneath, as the later,
    // undenied read proves.
    platform.clipboard.denyNextRead = true;

    let warningFired = false;
    guard.onWarningChange((active) => {
      if (active) warningFired = true;
    });

    await guard.handleForeground();

    // The old, un-hedged design would have trusted that first empty read
    // and silently suppressed any warning. The fix: the delayed second
    // check reads the real, still-present content, retries the clear
    // (succeeds now that focus is genuinely back), and the two checks
    // disagreeing is exactly what the design no longer papers over —
    // here it happens to resolve to a real, non-denied retry that
    // actually clears it.
    expect(await platform.clipboard.read()).toBe('');
    expect(guard.isWarningActive).toBe(false);
    expect(warningFired).toBe(false);
  });

  it('when the delayed re-check ALSO finds real content that fails to clear, the warning fires — the case the hedge exists for', async () => {
    await guard.clipboardManager.copy('hunter2');

    platform.clipboard.silentlyDenyNextWrite = true;
    session.lock('background');
    await Promise.resolve();
    await Promise.resolve();

    // First check: denied read, looks empty, looks like success.
    platform.clipboard.denyNextRead = true;
    // Second check (the delayed re-check): this time the read succeeds
    // and correctly shows real content, but the retry write is STILL
    // denied — a sustained focus-grant lag past the confirmation delay,
    // not just a single unlucky read.
    platform.clipboard.silentlyDenyNextWrite = true;

    await guard.handleForeground();

    expect(guard.isWarningActive).toBe(true);
    expect(await platform.clipboard.read()).toBe('hunter2');
  });

  it('two consecutive genuinely-empty reads (no denial in play) are trusted — the happy path is not slowed to the point of always warning', async () => {
    await guard.clipboardManager.copy('hunter2');
    session.lock('background'); // no denial flags set — clears for real
    await Promise.resolve();
    await Promise.resolve();
    expect(await platform.clipboard.read()).toBe('');

    let warningFired = false;
    guard.onWarningChange((active) => {
      if (active) warningFired = true;
    });

    await guard.handleForeground();

    expect(guard.isWarningActive).toBe(false);
    expect(warningFired).toBe(false);
  });

  it('a definite first failure (real content, retry write itself explicitly fails) warns immediately, without waiting for a second check', async () => {
    await guard.clipboardManager.copy('hunter2');
    platform.clipboard.silentlyDenyNextWrite = true;
    session.lock('background');
    await Promise.resolve();
    await Promise.resolve();

    // A non-empty first read is trustworthy on its own (denial can only
    // ever produce '', never fabricate content) — no denyNextRead here,
    // and no second read should be needed for this to warn.
    platform.clipboard.failNextWrite = true;
    await guard.handleForeground();

    expect(guard.isWarningActive).toBe(true);
  });

  it('an unexpected throw during verification fails toward showing the warning rather than silently doing nothing', async () => {
    await guard.clipboardManager.copy('hunter2');
    session.lock('background');
    await Promise.resolve();
    await Promise.resolve();

    const originalRead = platform.clipboard.read;
    platform.clipboard.read = async () => {
      throw new Error('simulated unexpected platform failure');
    };

    await expect(guard.handleForeground()).resolves.toBeUndefined();
    expect(guard.isWarningActive).toBe(true);

    platform.clipboard.read = originalRead;
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
