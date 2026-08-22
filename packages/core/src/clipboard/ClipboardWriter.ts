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
   */
  write(value: string): Promise<boolean>;
}
