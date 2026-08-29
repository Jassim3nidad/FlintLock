import { Platform } from 'react-native';
import { BiometricKeyInvalidatedError, BiometricKeySource, BiometricStrength } from '@flintlock/core';
import { fromKeyHandle, toKeyHandle } from '../crypto/keyHandleInterop';
import { Buffer } from '../crypto/native';
import { Keychain } from './native';

const SERVICE = 'flintlock.vault.dek';
/** react-native-keychain's setGenericPassword needs a username; unused, but not optional. */
const UNUSED_USERNAME = 'flintlock';

/**
 * Whether a thrown `unlock()` error should be treated as "the enrolled
 * key is dead" (`BiometricKeyInvalidatedError`) rather than "this prompt
 * attempt failed" (return null, unchanged). Platform-specific, and
 * deliberately not symmetric — each platform gets exactly as much
 * precision as react-native-keychain's Android/iOS native code actually
 * surfaces, traced from that library's own source rather than assumed:
 *
 * **Android — a real, if imprecise, signal.** `KeychainModule.kt`'s
 * `getGenericPassword()` catches decrypt-time failures in three tiers:
 * `KeyStoreAccessException` -> `E_KEYSTORE_ACCESS_ERROR`; a *prompt-level*
 * failure (declined, wrong finger, hardware error, user cancel) is
 * wrapped by `ResultHandlerInteractiveBiometric` into `CryptoFailedException`
 * -> `E_CRYPTO_FAILED`; anything else — including a real
 * `android.security.keystore.KeyPermanentlyInvalidatedException` thrown
 * by the decrypt call itself, which nothing wraps into a more specific
 * type before it's caught — falls through the generic `catch (fail: Throwable)`
 * -> `E_UNKNOWN_ERROR`. `E_UNKNOWN_ERROR` is therefore a *superset* that
 * includes invalidation but isn't exclusively it (any other unexpected
 * native failure lands there too) — not a dedicated code, the best
 * available signal by elimination. Confirmed from the library's Kotlin
 * source this session, not assumed; unconfirmed against a real
 * re-enrollment on real hardware.
 *
 * **iOS — no usable signal found.** `RNKeychainManager.m`'s `codeForError()`
 * surfaces only the raw numeric `OSStatus` as a string (e.g. `"-25293"`),
 * not a semantic code like Android's. Which specific `OSStatus` value(s)
 * a `.biometryCurrentSet`-invalidated item actually produces on a query
 * — as opposed to a declined prompt or any other keychain failure —
 * isn't something this session could confirm from source alone; guessing
 * a magic number here would be worse than not distinguishing at all.
 * `unlock()` therefore never throws `BiometricKeyInvalidatedError` on
 * iOS today — every iOS failure returns `null`, the same conservative
 * behavior as before this change. This is a real, stated limitation, not
 * an oversight: see docs/AUDIT-2026-08-25.md's F3 for what a real-device
 * pass would need to check to close it.
 */
function isLikelyInvalidation(error: unknown): boolean {
  if (Platform.OS !== 'android') return false;
  const code = (error as { code?: unknown } | null)?.code;
  return code === 'E_UNKNOWN_ERROR';
}

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
   * or null on cancellation, failure, or no enrollment. Throws
   * `BiometricKeyInvalidatedError` — and only that, never a raw
   * unwrapped platform error — when `isLikelyInvalidation()` recognizes
   * the failure as the enrolled key itself being permanently dead (see
   * that function's doc comment for the exact, platform-specific signal
   * and its limits). In that case this also removes the now-useless
   * stale Keychain entry itself via `disable()` — the one piece of
   * cleanup fully within this binding's own responsibility; resetting
   * `VaultSettings.biometricUnlockEnabled` is the caller's job, since
   * this binding has no vault/settings access. Any other failure
   * (declined prompt, wrong finger, hardware error, no enrollment)
   * still just returns null, unchanged — none of those mean anything is
   * broken, only that this specific attempt didn't succeed.
   */
  async unlock() {
    let result;
    try {
      result = await Keychain.getGenericPassword({
        service: SERVICE,
        authenticationPrompt: { title: 'Unlock Flintlock' },
      });
    } catch (error) {
      if (isLikelyInvalidation(error)) {
        await this.disable().catch(() => {});
        throw new BiometricKeyInvalidatedError();
      }
      return null;
    }
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
