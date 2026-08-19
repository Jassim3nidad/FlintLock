import { Buffer } from '../crypto';
import { Keychain } from './native';

const SERVICE = 'flintlock.vault.dek';
/** react-native-keychain's setGenericPassword needs a username; unused, but not optional. */
const UNUSED_USERNAME = 'flintlock';

/**
 * Whether this device has biometric hardware enrolled at all — not
 * whether *this vault* has biometric unlock turned on (that's
 * VaultSettings.biometricUnlockEnabled, checked separately so the UI
 * never has to probe the keychain to know).
 */
export async function isBiometricHardwareAvailable(): Promise<boolean> {
  const type = await Keychain.getSupportedBiometryType();
  return type !== null;
}

/**
 * Stores a copy of the DEK under a hardware-backed, biometric-gated key.
 * Call only immediately after a successful master-password unlock —
 * this does not verify the password itself, the caller already did that
 * to have a DEK in hand at all.
 *
 * `ACCESS_CONTROL.BIOMETRY_CURRENT_SET` is what gives us "any biometric
 * enrollment change invalidates the blob": Android ties the underlying
 * Keystore key to `setInvalidatedByBiometricEnrollment(true)`, and iOS's
 * `.biometryCurrentSet` access control does the platform equivalent. A
 * future unlock attempt after re-enrollment fails at the OS level and
 * `unlockWithBiometrics()` below returns null — never a stale success.
 */
export async function enrollBiometricUnlock(dek: Buffer): Promise<void> {
  const result = await Keychain.setGenericPassword(UNUSED_USERNAME, dek.toString('base64'), {
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
}

/**
 * Prompts for biometric authentication and returns the DEK on success,
 * or null on cancellation, failure, or no enrollment. Never throws for
 * the "user said no" case — only for genuine unexpected errors.
 */
export async function unlockWithBiometrics(): Promise<Buffer | null> {
  const result = await Keychain.getGenericPassword({
    service: SERVICE,
    authenticationPrompt: { title: 'Unlock Flintlock' },
  });
  if (result === false) return null;
  return Buffer.from(result.password, 'base64');
}

/**
 * Removes the biometric-gated key. The master password remains the only
 * way back in afterward — same as before biometric unlock was ever
 * enabled. Caller is responsible for also clearing
 * VaultSettings.biometricUnlockEnabled.
 */
export async function disableBiometricUnlock(): Promise<void> {
  await Keychain.resetGenericPassword({ service: SERVICE });
}
