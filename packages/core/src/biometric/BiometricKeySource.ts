import { KeyHandle } from '../crypto/CryptoProvider';

/**
 * The real, achievable biometric-unlock mechanism on this device/browser.
 *
 * Native is always 'hardware' — the OS Keystore/Secure Enclave holds the
 * DEK itself, gated by biometry. Web chains PRF → largeBlob →
 * 'unsupported': PRF is preferred where available (shipped earlier and
 * wider on Chromium; Safari 18+/iCloud Keychain support isn't reflected
 * in caniuse yet but is real per Apple's own confirmation). largeBlob is
 * the fallback where PRF is absent but the extension is present — it is
 * cryptographically real (the wrapped DEK is released only after user
 * verification, not merely gated by an assertion), not a weaker path
 * wearing the same label. If neither extension exists, biometric unlock
 * is simply not offered — there is no third, weaker tier.
 *
 * Data-residency note for SECURITY.md: PRF's wrapped DEK stays local
 * (IndexedDB); largeBlob's wrapped DEK lives on the authenticator and
 * syncs via iCloud Keychain / Google Password Manager. Encrypted and
 * inert without the vault either way, but the two paths must never be
 * described as equivalent on that point.
 */
export type BiometricStrength = 'hardware' | 'prf' | 'largeblob' | 'unsupported';

export interface BiometricKeySource {
  /**
   * The single source of truth for both "is this available" and "how
   * strong is it" — kept as one method so those two questions can't
   * disagree with each other.
   */
  strength(): Promise<BiometricStrength>;

  /**
   * Call immediately after a successful master-password unlock.
   *
   * On the web largeBlob path this is two separate user-verification
   * prompts, not one: `create()` may only negotiate support
   * (`largeBlob: {support: "required"}`), the actual write happens on a
   * subsequent `get()` assertion with `largeBlob: {write: bytes}`. A
   * concrete implementation on that path must drive the UI through both
   * prompts in sequence — this method's contract is "enrollment
   * complete", however many prompts that took.
   */
  enroll(dek: KeyHandle): Promise<void>;

  /** Prompts biometric auth; resolves the DEK on success, null on cancel/failure/no-enrollment. */
  unlock(): Promise<KeyHandle | null>;

  /** Master password remains the only way back in afterward, same as before enrollment. */
  disable(): Promise<void>;
}
