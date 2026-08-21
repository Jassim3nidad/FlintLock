import Clipboard from '@react-native-clipboard/clipboard';

/**
 * Single import point for the clipboard binding, same pattern used by
 * every other module's native.ts. Known gap, not silently glossed over: this
 * library's setString() has no parameter for Android 13+'s
 * EXTRA_IS_SENSITIVE flag (spec 5.6 asks for it, to exclude clipboard
 * content from the system clipboard-preview UI). As of the version
 * installed here there is no way to set it through this library's public
 * API — closing that gap needs either a native module extension or a
 * different library. Documented in SECURITY.md.
 */
export { Clipboard };
