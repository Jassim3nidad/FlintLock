import { ClipboardManager } from './clipboardManager';
import { UnlockSession } from '../unlock/session';

/**
 * Ties clipboard clearing to the vault session's lifecycle — session-
 * scoped, not screen-scoped, and with the specific ordering the failure
 * case needs. See PROMPT.md §5.6 ("Clear the clipboard on app lock too,
 * not just on the timer") and docs/AUDIT-2026-08-25.md's F2 for why the
 * original screen-scoped wiring (only cleared while `CredentialDetailScreen`
 * happened to still be mounted) and the original one-shot `onClearFailure`
 * (nothing ever subscribed to it) both fell short.
 *
 * Three legs, all required, none sufficient alone:
 *
 * 1. **`handleLock()`** — wire to `session.onLock()`. Attempts a clear
 *    immediately, for every lock reason (timeout, backgrounding, device
 *    lock, manual), regardless of which screen is currently mounted or
 *    even whether any screen is mounted at all.
 *
 * 2. **`handleForeground()`** — wire to the app's foreground-transition
 *    event, *after* `session.handleAppForegrounded()`. Locking via
 *    backgrounding is this app's default (`lockOnBackground: true`),
 *    which means leg 1's clear very often happens while backgrounded —
 *    exactly the condition under which Android 10+ silently denies
 *    clipboard writes (see `ClipboardWriter.write()`'s doc comment).
 *    `handleLock()`'s own report of success can't be trusted in that
 *    case; only a read-back once focus is back can confirm it. This
 *    calls `ClipboardManager.verifyCleared()` — but only when leg 1
 *    actually attempted a clear since the last time this ran (tracked by
 *    `pendingVerification`), *not* on every foreground transition. A
 *    foreground transition that isn't following a lock is a completely
 *    normal case where the clipboard is supposed to still hold a
 *    just-copied value (the 30-second timer hasn't run out yet) —
 *    unconditionally verifying on every foreground would wrongly treat
 *    that as a failure to clear.
 *
 * 3. **The failure warning survives the gap by construction, not by
 *    accident.** A clear failing at lock time has no UI to warn into —
 *    the app is backgrounded. Because verification only ever happens
 *    in `handleForeground()` (leg 2), the warning is only ever raised at
 *    a moment when there *is* a foregrounded UI to show it in — there is
 *    no ordering problem to solve by, say, queuing a notification. The
 *    warning is exposed as persistent state (`isWarningActive`, with a
 *    change subscription), not a one-shot event — the exact bug in the
 *    original `onClearFailure` design, where nothing was listening at
 *    the moment it fired. Whatever last copied the clipboard is never
 *    passed to or held by this class — the warning can only ever say
 *    something copied might still be there, never what, since naming it
 *    would recreate the exact disclosure the warning exists to guard
 *    against.
 *
 * A fourth thing this class deliberately does NOT trust on its own:
 * `verifyCleared()` reporting cleared=true from a `read()` that came back
 * empty. `AppState`'s 'active' event and Android's clipboard-focus grant
 * are not the same signal — 'active' fires when the activity resumes,
 * while clipboard access is gated on window focus, which can lag behind
 * (a lock-screen dismissal animation, a permission dialog still holding
 * focus) — so a `read()` performed right at `handleForeground()` can
 * come back empty because it's *denied*, not because the clipboard is
 * actually clear, and that looks identical to genuine success. Because
 * the cost is asymmetric — a spurious warning costs the user a glance, a
 * missed one costs them the password — `handleForeground()` does not
 * trust a first "cleared" result on its own: it re-verifies once more
 * after `foregroundConfirmationDelayMs`, and only suppresses the warning
 * if *both* checks agree. A first result that already found real content
 * (`cleared=false`) is trusted immediately without waiting — a non-empty
 * `read()` is proof focus was present for that read (denial can only
 * ever produce `''`, never fabricate content), so it isn't the ambiguous
 * case this hedges against. This is a heuristic, not a fix backed by
 * real hardware measurements of that lag — see docs/AUDIT-2026-08-25.md's
 * F2 for what's confirmed vs. still open.
 */
export class SessionClipboardGuard {
  readonly clipboardManager: ClipboardManager;
  private pendingVerification = false;
  private warningActive = false;
  private warningListeners: Array<(active: boolean) => void> = [];
  private unsubscribeLock: () => void;

  constructor(
    private session: UnlockSession,
    clipboardManager = new ClipboardManager(),
    /**
     * How long to wait before re-checking a first "cleared" result. Real
     * lock-screen-dismissal / focus-grant lag is unmeasured (no device
     * pass yet) — 500ms is a placeholder guess at "longer than a typical
     * animation," not a measured value. Overridable so tests aren't
     * forced to actually wait on it.
     */
    private foregroundConfirmationDelayMs = 500
  ) {
    this.clipboardManager = clipboardManager;
    this.clipboardManager.onClearFailure(() => this.setWarning(true));
    this.unsubscribeLock = this.session.onLock(() => this.handleLock());
  }

  private handleLock(): void {
    this.pendingVerification = true;
    this.clipboardManager.clear().catch(() => {});
  }

  /** Wire to the app's foreground-transition event, after session.handleAppForegrounded(). */
  async handleForeground(): Promise<void> {
    if (!this.pendingVerification) return;
    this.pendingVerification = false;
    let cleared: boolean;
    try {
      cleared = await this.verifyWithConfirmation();
    } catch {
      // Genuinely unknown state — fail toward showing the warning rather
      // than silently doing nothing, per this class's own doc comment on
      // asymmetric cost. ClipboardWriter's contract is to report failure
      // via return value, not throw, so reaching here means something
      // unexpected happened.
      this.setWarning(true);
      return;
    }
    if (cleared) this.setWarning(false);
    // If not cleared, verifyCleared() already triggered onClearFailure() -> setWarning(true).
  }

  /**
   * A first `verifyCleared()` result of `false` is a confirmed failure
   * (see this class's doc comment on why a non-empty read is trustworthy
   * on its own) — trusted immediately. A first result of `true` is only
   * provisional: re-checked once more after `foregroundConfirmationDelayMs`,
   * and only trusted if the second check agrees.
   */
  private async verifyWithConfirmation(): Promise<boolean> {
    const first = await this.clipboardManager.verifyCleared();
    if (!first) return false;
    await new Promise<void>((resolve) => setTimeout(resolve, this.foregroundConfirmationDelayMs));
    return this.clipboardManager.verifyCleared();
  }

  get isWarningActive(): boolean {
    return this.warningActive;
  }

  /** For the UI to dismiss the warning banner once the user has seen it. Does not imply the clipboard is actually clear. */
  dismissWarning(): void {
    this.setWarning(false);
  }

  onWarningChange(listener: (active: boolean) => void): () => void {
    this.warningListeners.push(listener);
    return () => {
      this.warningListeners = this.warningListeners.filter((l) => l !== listener);
    };
  }

  private setWarning(active: boolean): void {
    if (this.warningActive === active) return;
    this.warningActive = active;
    for (const listener of this.warningListeners) listener(active);
  }

  /** Call when the owning component unmounts, to release the session subscription. */
  dispose(): void {
    this.unsubscribeLock();
  }
}
