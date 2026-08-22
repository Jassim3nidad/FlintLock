import { getClipboardWriter } from '../platform';

const DEFAULT_CLEAR_AFTER_SECONDS = 30;

/**
 * Copies a value to the clipboard and clears it again after a fixed
 * delay (spec 5.6: 30 seconds, with a visible countdown). Also clears
 * immediately and unconditionally when clear() is called directly — wire
 * that to UnlockSession.onLock() so locking the vault clears the
 * clipboard too, not just the timer.
 *
 * Shared across native and web deliberately: the countdown/timer
 * behavior must be identical on both, and only the underlying write
 * primitive (ClipboardWriter) differs per platform. copy()/clear() both
 * report whether the write is known to have succeeded rather than
 * assuming it did — see ClipboardWriter's doc comment. The automatic,
 * timer-triggered clear is fire-and-forget from the caller's
 * perspective, so its failure surfaces through onClearFailure() rather
 * than a return value nobody is awaiting.
 *
 * Known gap on native: Android 13+'s EXTRA_IS_SENSITIVE flag (excludes
 * the value from the system clipboard-preview UI) isn't exposed by the
 * library the native ClipboardWriter wraps — see SECURITY.md.
 */
export class ClipboardManager {
  private secondsRemaining = 0;
  private tickInterval: ReturnType<typeof setInterval> | null = null;
  private tickListeners: Array<(secondsRemaining: number) => void> = [];
  private clearFailureListeners: Array<() => void> = [];

  constructor(private clearAfterSeconds = DEFAULT_CLEAR_AFTER_SECONDS) {}

  async copy(value: string): Promise<boolean> {
    this.stopTicking();
    const succeeded = await getClipboardWriter().write(value);
    this.secondsRemaining = this.clearAfterSeconds;
    this.notifyTick();
    this.tickInterval = setInterval(() => {
      this.secondsRemaining -= 1;
      if (this.secondsRemaining <= 0) {
        // clear() does its own notifyTick(0) — don't double-notify here.
        // Fire and forget: the interval itself is stopped synchronously
        // by clear(); we don't need to await the clipboard write to keep
        // tick semantics correct. A failure here is exactly what
        // onClearFailure() exists to surface.
        this.clear().catch(() => {});
      } else {
        this.notifyTick();
      }
    }, 1000);
    return succeeded;
  }

  /** Clears the clipboard immediately and cancels any pending countdown. Safe to call even if nothing is pending. */
  async clear(): Promise<boolean> {
    this.stopTicking();
    this.secondsRemaining = 0;
    this.notifyTick();
    const succeeded = await getClipboardWriter().write('');
    if (!succeeded) this.notifyClearFailure();
    return succeeded;
  }

  getSecondsRemaining(): number {
    return this.secondsRemaining;
  }

  onTick(listener: (secondsRemaining: number) => void): () => void {
    this.tickListeners.push(listener);
    return () => {
      this.tickListeners = this.tickListeners.filter((l) => l !== listener);
    };
  }

  /**
   * Fires whenever any clear — explicit or the automatic timer-driven
   * one — is known to have failed. The UI's job is to turn this into
   * "clipboard may still contain your password", never a guarantee the
   * platform didn't keep.
   */
  onClearFailure(listener: () => void): () => void {
    this.clearFailureListeners.push(listener);
    return () => {
      this.clearFailureListeners = this.clearFailureListeners.filter((l) => l !== listener);
    };
  }

  private stopTicking(): void {
    if (this.tickInterval !== null) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
  }

  private notifyTick(): void {
    for (const listener of this.tickListeners) listener(this.secondsRemaining);
  }

  private notifyClearFailure(): void {
    for (const listener of this.clearFailureListeners) listener();
  }
}
