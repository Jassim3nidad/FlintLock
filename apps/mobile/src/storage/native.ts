import { createMMKV } from 'react-native-mmkv';

/**
 * Single import point for the storage binding — mirrors src/crypto/native.ts.
 * Every other module in src/storage imports the instance from here, never
 * `react-native-mmkv` directly, so Jest can substitute the library's own
 * createMockMMKV() without touching production code paths.
 *
 * Deliberately not using MMKV's built-in encryptionKey option: all
 * confidentiality and integrity guarantees for vault data come from our
 * own AES-256-GCM envelope layer (src/crypto). Layering MMKV's own AES-CFB
 * encryption underneath would mean two overlapping encryption schemes
 * with separate key material and no clearer combined guarantee — one
 * well-understood, audited boundary is preferable to two half-understood
 * ones. MMKV here is a plain, unencrypted local key-value store; every
 * value it holds for vault content is already our own ciphertext.
 */
export const vaultStorage = createMMKV({ id: 'flintlock-vault' });
