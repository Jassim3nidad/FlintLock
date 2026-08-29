import { ClipboardWriter } from '../clipboard/ClipboardWriter';

export interface StubClipboardWriter extends ClipboardWriter {
  writes: string[];
  /** When set, the next write() resolves false — simulates a web focus-loss failure. */
  failNextWrite: boolean;
  /**
   * When set, the next write() resolves `true` (as if it succeeded) but
   * doesn't actually change the tracked clipboard content — simulating
   * Android 10+'s silent background-write denial, where the platform
   * call itself gives no error for `write()` to observe. Distinct from
   * `failNextWrite`, which models a failure `write()` *can* detect (the
   * web focus-loss case) — this models the one it structurally can't,
   * which only a `read()`-based check (`ClipboardManager.verifyCleared()`)
   * can catch.
   */
  silentlyDenyNextWrite: boolean;
  /**
   * When set, the next read() resolves `''` regardless of the actual
   * tracked content — simulating a real read denial (Android's clipboard
   * focus-gating covers get, not just set) landing at the exact moment
   * `SessionClipboardGuard.verifyCleared()` checks, before focus has
   * genuinely returned. Distinct from a real empty clipboard: `current`
   * itself is untouched, so the read immediately after this one (or a
   * direct read via the test's own `platform.clipboard.read()`) sees the
   * real value again.
   */
  denyNextRead: boolean;
}

export function createStubClipboardWriter(): StubClipboardWriter {
  let current = '';
  const writer: StubClipboardWriter = {
    writes: [],
    failNextWrite: false,
    silentlyDenyNextWrite: false,
    denyNextRead: false,
    async write(value) {
      writer.writes.push(value);
      if (writer.failNextWrite) {
        writer.failNextWrite = false;
        return false;
      }
      if (writer.silentlyDenyNextWrite) {
        writer.silentlyDenyNextWrite = false;
        return true; // reports success, but current is deliberately left unchanged below
      }
      current = value;
      return true;
    },
    async read() {
      if (writer.denyNextRead) {
        writer.denyNextRead = false;
        return '';
      }
      return current;
    },
  };
  return writer;
}
