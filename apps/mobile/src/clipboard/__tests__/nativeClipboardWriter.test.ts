jest.mock('../native');

import { Clipboard } from '../native';
import { nativeClipboardWriter } from '../nativeClipboardWriter';

// jest.mock('../native') and a direct import of '../__mocks__/native' load
// as two independent module instances — jest.requireMock is the only way
// to reach the exact instance nativeClipboardWriter.ts itself is using.
const mockNative = jest.requireMock<typeof import('../__mocks__/native')>('../native');

beforeEach(() => {
  mockNative.__reset();
});

describe('nativeClipboardWriter', () => {
  it('writes the value and reports success', async () => {
    const succeeded = await nativeClipboardWriter.write('hunter2');
    expect(succeeded).toBe(true);
    expect(await Clipboard.getString()).toBe('hunter2');
  });

  it('read() returns whatever is currently on the clipboard', async () => {
    await nativeClipboardWriter.write('hunter2');
    expect(await nativeClipboardWriter.read()).toBe('hunter2');
  });

  it('a write denied while unfocused reports success but silently does not land, revealed once focus returns', async () => {
    await nativeClipboardWriter.write('hunter2');

    mockNative.__setFocused(false);
    const succeeded = await nativeClipboardWriter.write('should-not-land');

    // The point of this leg: write() itself can't tell the caller
    // anything is wrong here — this mirrors ClipboardWriter.write()'s own
    // doc comment on why write()'s return value can't be trusted on
    // Android. Ground truth (bypassing the focus gate, which a real
    // caller has no equivalent of) confirms the write never landed.
    expect(succeeded).toBe(true);
    expect(mockNative.__peek()).toBe('hunter2');

    // read() itself is *also* focus-gated on real Android — a caller
    // can't distinguish "denied" from "genuinely empty" while still
    // unfocused either, which is exactly why ClipboardManager.verifyCleared()
    // is only ever called after foreground is confirmed back (see that
    // method's doc comment). Once focus is back, read() reflects the
    // true, unchanged content — this is what lets verifyCleared() detect
    // and retry the denied clear.
    mockNative.__setFocused(true);
    expect(await nativeClipboardWriter.read()).toBe('hunter2');
  });
});
