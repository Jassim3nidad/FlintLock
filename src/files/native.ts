import { Share } from 'react-native';
import { PickedFile } from './types';

/**
 * Single import point for the file I/O the export/import screens need,
 * same pattern used by every other module's native.ts.
 *
 * shareText is real, backed by React Native core's own Share API — no
 * extra native dependency required. It only carries text, so a binary
 * format (the .flbx export) is base64-encoded by the caller first.
 *
 * pickFile is a known, explicitly-flagged gap: choosing an arbitrary
 * file from device storage needs a native document-picker module (e.g.
 * react-native-document-picker), which isn't installed. Rather than
 * silently fake success, this throws so a UI bug that skips handling it
 * fails loudly instead of pretending an import happened. Documented in
 * SECURITY.md's known-gaps section.
 */
export const fileSystem = {
  async shareText(content: string, dialogTitle: string): Promise<void> {
    await Share.share({ message: content }, { dialogTitle });
  },
  async pickFile(): Promise<PickedFile | null> {
    throw new Error('Picking a file from device storage requires a native document-picker module, which is not yet installed.');
  },
};
