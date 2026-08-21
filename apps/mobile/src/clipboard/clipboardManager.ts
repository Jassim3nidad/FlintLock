import { Clipboard } from './native';

const DEFAULT_CLEAR_AFTER_SECONDS = 30;

/**
 * Copies a value to the clipboard and clears it again after a fixed
 * delay (spec 5.6: 30 seconds, with a visible countdown). Also clears
 * immediately and unconditionally when clear() is called directly — wire
 * that to UnlockSession.onLock() so locking the vault clears the
 * clipboard too, not just the timer (spec: "Clear the clipboard on app
 * lock too, not just on the timer").
 *
 * Known gap: Android 13+'s EXTRA_IS_SENSITIVE flag (excludes the value
 * from the system clipboard-preview UI) isn't exposed by the clipboard
 * library this wraps — see src/clipboard/native.ts's header comment.
 */
export class ClipboardManager {
  private secondsRemaining = 0;
  private tickInterval: ReturnType<typeof setInterval> | null = null;
  private listeners: Array<(secondsRemaining: number) => void> = [];

  constructor(private clearAfterSeconds = DEFAULT_CLEAR_AFTER_SECONDS) {}

  async copy(value: string): Promise<void> {
    this.stopTicking();
    await Clipboard.setString(value);
    this.secondsRemaining = this.clearAfterSeconds;
    this.notify();
    this.tickInterval = setInterval(() => {
      this.secondsRemaining -= 1;
      if (this.secondsRemaining <= 0) {
        // clear() does its own notify(0) — don't double-notify here.
        // Fire and forget: the interval itself is stopped synchronously
        // by clear(); we don't need to await the clipboard write to keep
        // tick semantics correct.
        this.clear().catch(() => {});
      } else {
        this.notify();
      }
    }, 1000);
  }

  /** Clears the clipboard immediately and cancels any pending countdown. Safe to call even if nothing is pending. */
  async clear(): Promise<void> {
    this.stopTicking();
    this.secondsRemaining = 0;
    this.notify();
    await Clipboard.setString('');
  }

  getSecondsRemaining(): number {
    return this.secondsRemaining;
  }

  onTick(listener: (secondsRemaining: number) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private stopTicking(): void {
    if (this.tickInterval !== null) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
  }

  private notify(): void {
    for (const listener of this.listeners) listener(this.secondsRemaining);
  }
}
