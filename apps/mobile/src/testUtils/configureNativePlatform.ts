import { configurePlatform } from '@flintlock/core';
import { nativeBiometricKeySource } from '../biometric/nativeBiometricKeySource';
import { nativeClipboardWriter } from '../clipboard/nativeClipboardWriter';
import { nativeCryptoProvider } from '../crypto/nativeCryptoProvider';
import { nativeSecureStore } from '../storage/nativeSecureStore';

/**
 * Configures @flintlock/core with apps/mobile's real platform bindings,
 * same as production's platformBindings.ts — tests need this too since
 * nothing else calls configurePlatform() in a test run. Safe to call
 * repeatedly; each call just overwrites the previous bindings.
 *
 * Relies on the *calling* test file having already called
 * jest.mock('../../crypto/native') etc. (same requirement
 * renderUnlockedScreen.tsx and seedVault already carry) — those mocks
 * are hoisted above this file's imports in whichever test file pulls it
 * in, which is what makes the native.ts imports below resolve to the
 * mocked doubles rather than the real native modules.
 */
export function configureNativeTestPlatform(): void {
  configurePlatform({
    crypto: nativeCryptoProvider,
    secureStore: nativeSecureStore,
    biometric: nativeBiometricKeySource,
    clipboard: nativeClipboardWriter,
  });
}
