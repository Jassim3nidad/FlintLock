jest.mock('../native');

import { Buffer as CoreBuffer } from '@flintlock/core';
import { describeCryptoProviderConformance } from '@flintlock/core/src/testing/cryptoProviderConformance';
import { fromKeyHandle } from '../keyHandleInterop';
import { nativeCryptoProvider } from '../nativeCryptoProvider';

// Same shared suite packages/core runs against its Node reference
// provider (see packages/core/src/crypto/__tests__/conformance.test.ts),
// run here against apps/mobile's real CryptoProvider — modulo the
// jest.mock('../native') above, which substitutes the Node-crypto-backed
// test double for react-native-quick-crypto (see crypto/__mocks__/native.ts).
// That validates this file's own wrapper logic (parameter marshalling,
// AAD handling, IV/tag plumbing) against a real OpenSSL backend; it does
// NOT validate react-native-quick-crypto's native bindings themselves —
// that needs an on-device/simulator run (see docs/CRYPTO.md, phase 3).
describeCryptoProviderConformance('native (mocked QuickCrypto)', () => nativeCryptoProvider, (handle) =>
  CoreBuffer.from(fromKeyHandle(handle))
);
