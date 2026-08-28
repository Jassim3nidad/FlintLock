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
}

export function createStubClipboardWriter(): StubClipboardWriter {
  let current = '';
  const writer: StubClipboardWriter = {
    writes: [],
    failNextWrite: false,
    silentlyDenyNextWrite: false,
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
      return current;
    },
  };
  return writer;
}
