import { ClipboardWriter } from '@flintlock/core';
import { Clipboard } from './native';

/**
 * react-native-clipboard's setString()/getString() never throw and have
 * no return value indicating denial — including Android 10+'s
 * focus-gated denial of background clipboard access (see
 * ClipboardWriter's own doc comment for why write()'s `true` return
 * can't be trusted as proof a background clear actually happened, and
 * why read()-based verification on next foreground is what actually
 * catches it).
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

  async read() {
    return Clipboard.getString();
  },
};
