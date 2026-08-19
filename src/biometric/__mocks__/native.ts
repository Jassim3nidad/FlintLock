/**
 * Jest test double for ./native.
 *
 * This validates biometricVault.ts's own logic — which options it passes,
 * how it handles a declined/failed prompt vs. a genuine error, service
 * naming — against a controllable fake. It cannot and does not validate
 * that react-native-keychain's real native code actually produces a
 * hardware-backed, biometric-gated key; that requires an on-device or
 * simulator run with real biometric hardware/enrollment, which is
 * unverified as of this writing (see the phase report).
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

/** Test control: simulates a biometric enrollment change invalidating stored entries. */
export function __simulateBiometricEnrollmentChange(): void {
  store.clear();
}

export function __reset(): void {
  store.clear();
  nextPromptSucceeds = true;
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
  const service = options?.service ?? 'default';
  store.set(service, { username, password });
  return { service, storage: 'KeystoreAESGCM' };
}

async function getGenericPassword(
  options?: { service?: string }
): Promise<false | { service: string; username: string; password: string; storage: string }> {
  const service = options?.service ?? 'default';
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
