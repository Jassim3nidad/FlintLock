export interface ClipboardWriter {
  /**
   * Resolves with whether the write is known to have succeeded — not
   * void. On web, `navigator.clipboard.writeText` requires document
   * focus and silently fails if the user has tabbed away, which is
   * exactly the moment the automatic 30s-timer clear needs to fire. A
   * void-returning write() would let that failure disappear; the caller
   * (ClipboardManager) needs the real answer to tell the UI "clipboard
   * may still contain your password" instead of asserting a guarantee
   * the platform didn't keep.
   *
   * **This return value cannot be trusted as the sole failure signal on
   * Android.** Android 10+ denies clipboard *write* access to apps that
   * don't currently have focus by silently no-opping the underlying
   * `ClipboardManager.setPrimaryClip()` call — the call doesn't throw and
   * there is no error for this method to observe and turn into `false`.
   * A clear attempted at lock time, when the lock was triggered by
   * backgrounding, is exactly this case: the write silently does
   * nothing, and `write()` has no way to know. See `read()` below, which
   * is what actually detects this — verifying the clipboard's real
   * content once focus is back, rather than trusting this call's own
   * report of itself.
   */
  write(value: string): Promise<boolean>;

  /**
   * Reads the current clipboard content. Added specifically so a caller
   * can verify a clear actually took effect rather than trusting
   * `write()`'s return value — see that method's doc comment for why
   * `write()` alone can't be trusted on Android. Like `write()`, reading
   * is itself subject to the same focus restriction on Android 10+ (a
   * background app's read is also denied) — call this only once the app
   * is confirmed foregrounded, which is the only time this verification
   * is meaningful anyway.
   */
  read(): Promise<string>;
}
