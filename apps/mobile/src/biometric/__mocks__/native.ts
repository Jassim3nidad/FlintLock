/**
 * Jest test double for ./native.
 *
 * This validates biometricVault.ts's own logic — which options it passes,
 * how it handles a declined/failed prompt vs. a genuine invalidation
 * throw, service naming — against a controllable fake, including a
 * distinct throw path (`__setNextBiometricPromptError()` /
 * `__simulateBiometricEnrollmentChange()`) for the case a mock that only
 * ever resolves cleanly structurally cannot represent — see F3 in
 * docs/AUDIT-2026-08-25.md for why that distinction matters. It cannot
 * and does not validate that react-native-keychain's real native code
 * actually produces a hardware-backed, biometric-gated key, or that the
 * real Android bridge really does set `error.code` to `E_UNKNOWN_ERROR`
 * for a real `KeyPermanentlyInvalidatedException` the way this mock
 * assumes; that requires an on-device or simulator run with real
 * biometric hardware/enrollment, which is unverified as of this writing
 * (see the phase report).
 */

interface StoredEntry {
  username: string;
  password: string;
}

const store = new Map<string, StoredEntry>();

/** Test control: whether the next biometric prompt succeeds. Defaults to true. */
let nextPromptSucceeds = true;
export function __setNextBiometricPromptResult(succeeds: boolean): void {
  nextPromptSucceeds = succeeds;
}

/**
 * Test control: makes the next getGenericPassword() call reject instead
 * of resolving, with `.code` set the way react-native-keychain's Android
 * bridge sets it on the rejected promise's Error (see
 * nativeBiometricKeySource.ts's `isLikelyInvalidation()` doc comment for
 * where E_UNKNOWN_ERROR specifically comes from). Distinct from
 * `__setNextBiometricPromptResult(false)`, which models the *declined-
 * prompt* case getGenericPassword() can report cleanly by resolving
 * `false` — this models a case it structurally can't report that way at
 * all.
 */
let nextGetGenericPasswordThrows: { code: string; message?: string } | null = null;
export function __setNextBiometricPromptError(code: string, message?: string): void {
  nextGetGenericPasswordThrows = { code, message };
}

/**
 * Simulates a real biometric enrollment change invalidating the stored
 * entry — a *throw* with `E_UNKNOWN_ERROR`, matching
 * `isLikelyInvalidation()`'s traced Android behavior, not a clean "not
 * found." A previous version of this mock cleared the store instead,
 * which made getGenericPassword() resolve `false` — indistinguishable
 * from "nothing was ever enrolled," exactly the gap F3 originally
 * flagged (this mock structurally couldn't exercise the throw path at
 * all). Deliberately does NOT clear the store itself — the real cleanup
 * is `nativeBiometricKeySource.unlock()` calling `disable()` once it
 * catches this, and a test proving that happened needs the mock to
 * still hold the stale entry going into the call, not pre-remove it.
 */
export function __simulateBiometricEnrollmentChange(): void {
  __setNextBiometricPromptError('E_UNKNOWN_ERROR', 'Key permanently invalidated');
}

/** Test control: makes the next setGenericPassword() call resolve `false`, as react-native-keychain does on a genuine store failure (see enroll()'s own doc comment on why it throws when this happens). */
let nextSetGenericPasswordFails = false;
export function __setNextEnrollmentResult(succeeds: boolean): void {
  nextSetGenericPasswordFails = !succeeds;
}

export function __reset(): void {
  store.clear();
  nextPromptSucceeds = true;
  nextGetGenericPasswordThrows = null;
  nextSetGenericPasswordFails = false;
}

const ACCESS_CONTROL = { BIOMETRY_CURRENT_SET: 'BiometryCurrentSet' } as const;
const ACCESSIBLE = { WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'AccessibleWhenUnlockedThisDeviceOnly' } as const;
const SECURITY_LEVEL = { SECURE_HARDWARE: 1 } as const;
const STORAGE_TYPE = { AES_GCM: 'KeystoreAESGCM' } as const;

async function getSupportedBiometryType(): Promise<string | null> {
  return 'Fingerprint';
}

async function setGenericPassword(
  username: string,
  password: string,
  options?: { service?: string }
): Promise<false | { service: string; storage: string }> {
  if (nextSetGenericPasswordFails) {
    nextSetGenericPasswordFails = false;
    return false;
  }
  const service = options?.service ?? 'default';
  store.set(service, { username, password });
  return { service, storage: 'KeystoreAESGCM' };
}

async function getGenericPassword(
  options?: { service?: string }
): Promise<false | { service: string; username: string; password: string; storage: string }> {
  const service = options?.service ?? 'default';
  if (nextGetGenericPasswordThrows) {
    const { code, message } = nextGetGenericPasswordThrows;
    nextGetGenericPasswordThrows = null;
    const error = new Error(message ?? code) as Error & { code: string };
    error.code = code;
    throw error;
  }
  if (!nextPromptSucceeds) return false;
  const entry = store.get(service);
  if (!entry) return false;
  return { service, username: entry.username, password: entry.password, storage: 'KeystoreAESGCM' };
}

async function resetGenericPassword(options?: { service?: string }): Promise<boolean> {
  const service = options?.service ?? 'default';
  return store.delete(service);
}

export const Keychain = {
  ACCESS_CONTROL,
  ACCESSIBLE,
  SECURITY_LEVEL,
  STORAGE_TYPE,
  getSupportedBiometryType,
  setGenericPassword,
  getGenericPassword,
  resetGenericPassword,
};
