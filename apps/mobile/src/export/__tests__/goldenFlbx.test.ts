jest.mock('../../crypto/native');
jest.mock('../../storage/native');

import { configurePlatform, resetPlatformForTests } from '@flintlock/core';
import { describeGoldenFlbxCheck } from '@flintlock/core/src/testing/goldenFlbxCheck';
import { createStubBiometricKeySource, createStubClipboardWriter } from '@flintlock/core/src/testing';
import { nativeCryptoProvider } from '../../crypto/nativeCryptoProvider';
import { nativeSecureStore } from '../../storage/nativeSecureStore';
import { vaultStorage } from '../../storage/native';

beforeEach(() => {
  vaultStorage.clearAll();
  configurePlatform({
    crypto: nativeCryptoProvider,
    secureStore: nativeSecureStore,
    biometric: createStubBiometricKeySource(),
    clipboard: createStubClipboardWriter(),
  });
});

afterEach(() => resetPlatformForTests());

// Proves apps/mobile's own CryptoProvider — not the Node reference one —
// can open a fixture it didn't write. See goldenFlbxCheck.ts.
describeGoldenFlbxCheck('native (mocked QuickCrypto)');
