/**
 * Single import point for the OS keychain/keystore binding — mirrors
 * src/crypto/native.ts and src/storage/native.ts. Everything in
 * src/biometric imports from here, never `react-native-keychain`
 * directly, so Jest can substitute a test double.
 *
 * react-native-keychain, not a hand-rolled native module: it wraps
 * Android Keystore (hardware-backed AES-GCM, `STORAGE_TYPE.AES_GCM`
 * requires user authentication for both wrap and unwrap) and iOS
 * Keychain/Secure Enclave, and is used by several other security-
 * sensitive apps (Rainbow Wallet, MetaMask Mobile). We do not implement
 * our own Keystore key generation or wrapping here — the library's
 * native code does that, gated by `ACCESS_CONTROL.BIOMETRY_CURRENT_SET`.
 */
import * as Keychain from 'react-native-keychain';

export { Keychain };
