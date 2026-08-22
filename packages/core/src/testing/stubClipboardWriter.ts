import { ClipboardWriter } from '../clipboard/ClipboardWriter';

export interface StubClipboardWriter extends ClipboardWriter {
  writes: string[];
  /** When set, the next write() resolves false — simulates a web focus-loss failure. */
  failNextWrite: boolean;
}

export function createStubClipboardWriter(): StubClipboardWriter {
  const writer: StubClipboardWriter = {
    writes: [],
    failNextWrite: false,
    async write(value) {
      writer.writes.push(value);
      if (writer.failNextWrite) {
        writer.failNextWrite = false;
        return false;
      }
      return true;
    },
  };
  return writer;
}
