import { Buffer } from 'buffer';
import { getCryptoProvider } from '../platform';
import { randomBytes } from './csprng';
import { KeyHandle } from './CryptoProvider';
import { deriveKek } from './kdf';
import { KdfParams, WrappedKey } from './types';

/** A fresh, random 256-bit Data Encryption Key. Never derived — always random. */
export function generateDek(): Promise<KeyHandle> {
  return getCryptoProvider().generateDek();
}

export function generateSalt(length = 32): Buffer {
  return randomBytes(length);
}

/**
 * Binds a wrapped-DEK blob to the vault it belongs to and to the KDF
 * params version that produced the KEK, so a wrapped DEK can't be moved
 * to a different vault header or paired with stale KDF params.
 */
export function dekWrapAad(vaultId: string, kdfParamsVersion: number): Buffer {
  const idBytes = Buffer.from(vaultId, 'utf8');
  const header = Buffer.alloc(4);
  header.writeUInt32BE(kdfParamsVersion, 0);
  return Buffer.concat([header, idBytes]);
}

export function wrapKey(subject: KeyHandle, wrappingKey: KeyHandle, aad: Buffer): Promise<WrappedKey> {
  return getCryptoProvider().wrapKey(subject, wrappingKey, aad);
}

/**
 * Unwraps a key. For the DEK-under-password path this IS master-password
 * verification: there is no separate password hash anywhere. A bad
 * password produces a KEK that fails the GCM auth tag, which rejects
 * here — same as any other tamper/corruption case. Fail closed either
 * way. The same operation also unwraps the DEK under a biometric
 * wrapping key (PRF/largeBlob-derived, or the native hardware path).
 */
export function unwrapKey(wrapped: WrappedKey, wrappingKey: KeyHandle, aad: Buffer): Promise<KeyHandle> {
  return getCryptoProvider().unwrapKey(wrapped, wrappingKey, aad);
}

export interface KdfUpgradeResult {
  wrappedDek: WrappedKey;
  kdfParams: KdfParams;
  salt: Buffer;
}

/**
 * Re-derives the KEK under new KDF params (e.g. raised PBKDF2 iterations,
 * or a switch to argon2id) and re-wraps the *same* DEK under it. Vault
 * records stay untouched — only the envelope around the DEK changes.
 *
 * Requires the master password again: raising KDF params doesn't help if
 * we can just reuse a KEK derived under the old (weaker) params.
 */
export async function upgradeKdfParams(
  masterPassword: Buffer,
  currentWrappedDek: WrappedKey,
  currentParams: KdfParams,
  currentSalt: Buffer,
  currentAad: Buffer,
  newParams: KdfParams,
  vaultId: string,
  newKdfParamsVersion: number
): Promise<KdfUpgradeResult> {
  const provider = getCryptoProvider();
  const oldKek = await deriveKek(masterPassword, currentParams, currentSalt);
  let dek: KeyHandle;
  try {
    dek = await unwrapKey(currentWrappedDek, oldKek, currentAad);
  } finally {
    provider.disposeKey(oldKek);
  }

  const newSalt = generateSalt();
  const newKek = await deriveKek(masterPassword, newParams, newSalt);
  const newAad = dekWrapAad(vaultId, newKdfParamsVersion);
  try {
    const wrappedDek = await wrapKey(dek, newKek, newAad);
    return { wrappedDek, kdfParams: newParams, salt: newSalt };
  } finally {
    provider.disposeKey(newKek);
    provider.disposeKey(dek);
  }
}
