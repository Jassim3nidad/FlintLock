import { configurePlatform } from '@flintlock/core';
import { nativeBiometricKeySource } from './biometric/nativeBiometricKeySource';
import { nativeClipboardWriter } from './clipboard/nativeClipboardWriter';
import { nativeCryptoProvider } from './crypto/nativeCryptoProvider';
import { nativeSecureStore } from './storage/nativeSecureStore';

/**
 * The one place apps/mobile tells @flintlock/core which concrete
 * platform implementations to use. Imported for its side effect only —
 * must run before anything else in the app touches @flintlock/core, so
 * this is imported first thing in index.js, ahead of App.
 */
configurePlatform({
  crypto: nativeCryptoProvider,
  secureStore: nativeSecureStore,
  biometric: nativeBiometricKeySource,
  clipboard: nativeClipboardWriter,
});
