import { ClipboardWriter } from '@flintlock/core';
import { Clipboard } from './native';

/**
 * react-native-clipboard's setString() has no failure mode worth
 * reporting on native — unlike the web Clipboard API, it doesn't depend
 * on document focus, so success is assumed once the call resolves.
 *
 * Known gap, not silently glossed over: this library's setString() has
 * no parameter for Android 13+'s EXTRA_IS_SENSITIVE flag (spec 5.6 asks
 * for it, to exclude clipboard content from the system clipboard-preview
 * UI). As of the version installed here there is no way to set it
 * through this library's public API — closing that gap needs either a
 * native module extension or a different library. Documented in
 * SECURITY.md.
 */
export const nativeClipboardWriter: ClipboardWriter = {
  async write(value) {
    await Clipboard.setString(value);
    return true;
  },
};
