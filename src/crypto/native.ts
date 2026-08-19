/**
 * Single import point for the native crypto binding.
 *
 * Every other module in src/crypto imports QuickCrypto from here, never
 * directly from 'react-native-quick-crypto'. That gives Jest one place to
 * substitute a Node-crypto-backed test double (see __mocks__/native.ts)
 * without touching production code paths.
 */
import QuickCrypto, { Buffer } from 'react-native-quick-crypto';

/**
 * Bare React Native has no global `Buffer` — unlike Node/Jest, which
 * provide one, making the gap easy to miss in tests. Every file in
 * src/crypto must import Buffer as a value from here rather than relying
 * on the ambient global.
 */
export { Buffer };

export default QuickCrypto;
