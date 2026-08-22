import { configurePlatform, resetPlatformForTests } from '../platform';
import { SecureStore } from '../storage/SecureStore';
import { createInMemorySecureStore } from './inMemorySecureStore';
import { createNodeCryptoProvider } from './nodeCryptoProvider';
import { createStubBiometricKeySource } from './stubBiometricKeySource';
import { createStubClipboardWriter, StubClipboardWriter } from './stubClipboardWriter';

export interface TestPlatform {
  clipboard: StubClipboardWriter;
  /** The exact SecureStore instance wired into this test's platform — for tests that need to reach in and corrupt bytes directly (tamper-detection cases). */
  secureStore: SecureStore;
}

/**
 * Configures @flintlock/core with fresh reference implementations —
 * call in beforeEach, pair with resetPlatformForTests() in afterEach.
 * Every core test file that exercises anything beyond pure functions
 * needs this; it's the test-time equivalent of apps/mobile's
 * platformBindings.ts / apps/web's future equivalent.
 */
export function configureTestPlatform(): TestPlatform {
  const clipboard = createStubClipboardWriter();
  const secureStore = createInMemorySecureStore();
  configurePlatform({
    crypto: createNodeCryptoProvider(),
    secureStore,
    biometric: createStubBiometricKeySource(),
    clipboard,
  });
  return { clipboard, secureStore };
}

export { resetPlatformForTests };
