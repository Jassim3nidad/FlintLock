import { PickedFile } from '../types';

let nextPickedFile: PickedFile | null | 'throw' = 'throw';
const shareCalls: { content: string; dialogTitle: string }[] = [];

export const fileSystem = {
  async shareText(content: string, dialogTitle: string): Promise<void> {
    shareCalls.push({ content, dialogTitle });
  },
  async pickFile(): Promise<PickedFile | null> {
    if (nextPickedFile === 'throw') {
      throw new Error('Picking a file from device storage requires a native document-picker module, which is not yet installed.');
    }
    return nextPickedFile;
  },
};

/** Test hook: control what the next pickFile() call returns (or 'throw' to simulate the real not-yet-implemented gap). */
export function __setNextPickedFile(file: PickedFile | null | 'throw'): void {
  nextPickedFile = file;
}

/** Test hook: inspect what's been shared so far. */
export function __getShareCalls(): { content: string; dialogTitle: string }[] {
  return shareCalls;
}

/** Test hook: reset mock state between tests. */
export function __reset(): void {
  nextPickedFile = 'throw';
  shareCalls.length = 0;
}
