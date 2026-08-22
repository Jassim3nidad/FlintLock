import { BiometricKeySource, BiometricStrength } from '@flintlock/core';
import { fromKeyHandle, toKeyHandle } from '../crypto/keyHandleInterop';
import { Buffer } from '../crypto/native';
import { Keychain } from './native';

const SERVICE = 'flintlock.vault.dek';
/** react-native-keychain's setGenericPassword needs a username; unused, but not optional. */
const UNUSED_USERNAME = 'flintlock';

/**
 * Native's BiometricKeySource: the OS Keystore/Secure Enclave holds the
 * DEK itself, gated by biometry, so `strength()` is always 'hardware' —
 * there is no PRF/largeBlob-style tiering on this platform.
 *
 * `ACCESS_CONTROL.BIOMETRY_CURRENT_SET` is what gives "any biometric
 * enrollment change invalidates the blob": Android ties the underlying
 * Keystore key to `setInvalidatedByBiometricEnrollment(true)`, and iOS's
 * `.biometryCurrentSet` access control does the platform equivalent. A
 * future unlock attempt after re-enrollment fails at the OS level and
 * unlock() below returns null — never a stale success.
 */
export const nativeBiometricKeySource: BiometricKeySource = {
  async strength(): Promise<BiometricStrength> {
    const type = await Keychain.getSupportedBiometryType();
    return type !== null ? 'hardware' : 'unsupported';
  },

  /**
   * Call only immediately after a successful master-password unlock —
   * this does not verify the password itself, the caller already did
   * that to have a DEK in hand at all.
   */
  async enroll(dek): Promise<void> {
    const result = await Keychain.setGenericPassword(UNUSED_USERNAME, fromKeyHandle(dek).toString('base64'), {
      service: SERVICE,
      accessControl: Keychain.ACCESS_CONTROL.BIOMETRY_CURRENT_SET,
      accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      securityLevel: Keychain.SECURITY_LEVEL.SECURE_HARDWARE,
      storage: Keychain.STORAGE_TYPE.AES_GCM,
      authenticationPrompt: { title: 'Confirm to enable biometric unlock' },
    });
    if (result === false) {
      throw new Error('Failed to store the biometric-gated key');
    }
  },

  /**
   * Prompts for biometric authentication and returns the DEK on success,
   * or null on cancellation, failure, or no enrollment. Never throws for
   * the "user said no" case — only for genuine unexpected errors.
   */
  async unlock() {
    const result = await Keychain.getGenericPassword({
      service: SERVICE,
      authenticationPrompt: { title: 'Unlock Flintlock' },
    });
    if (result === false) return null;
    return toKeyHandle(Buffer.from(result.password, 'base64'));
  },

  /**
   * Removes the biometric-gated key. The master password remains the
   * only way back in afterward — same as before biometric unlock was
   * ever enabled. Caller is responsible for also clearing
   * VaultSettings.biometricUnlockEnabled.
   */
  async disable(): Promise<void> {
    await Keychain.resetGenericPassword({ service: SERVICE });
  },
};
