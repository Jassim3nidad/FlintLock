jest.mock('../native');

import { Clipboard } from '../native';
import { nativeClipboardWriter } from '../nativeClipboardWriter';

describe('nativeClipboardWriter', () => {
  it('writes the value and reports success', async () => {
    const succeeded = await nativeClipboardWriter.write('hunter2');
    expect(succeeded).toBe(true);
    expect(await Clipboard.getString()).toBe('hunter2');
  });
});
