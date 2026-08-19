import { aesGcmDecrypt, aesGcmEncrypt } from './cipher';
import { randomBytes } from './csprng';
import { deriveKek } from './kdf';
import { Buffer } from './native';
import { KEY_LENGTH_BYTES, KdfParams, WrappedKey } from './types';

/** A fresh, random 256-bit Data Encryption Key. Never derived — always random. */
export function generateDek(): Buffer {
  return randomBytes(KEY_LENGTH_BYTES);
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

export function wrapDek(dek: Buffer, kek: Buffer, aad: Buffer): WrappedKey {
  return aesGcmEncrypt(dek, kek, aad);
}

/**
 * Unwraps the DEK. This IS master-password verification: there is no
 * separate password hash anywhere. A bad password produces a KEK that
 * fails the GCM auth tag, which throws DecryptionError here — same as
 * any other tamper/corruption case. Fail closed either way.
 */
export function unwrapDek(wrapped: WrappedKey, kek: Buffer, aad: Buffer): Buffer {
  return aesGcmDecrypt(wrapped, kek, aad);
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
  const oldKek = await deriveKek(masterPassword, currentParams, currentSalt);
  let dek: Buffer;
  try {
    dek = unwrapDek(currentWrappedDek, oldKek, currentAad);
  } finally {
    oldKek.fill(0);
  }

  const newSalt = generateSalt();
  const newKek = await deriveKek(masterPassword, newParams, newSalt);
  const newAad = dekWrapAad(vaultId, newKdfParamsVersion);
  try {
    const wrappedDek = wrapDek(dek, newKek, newAad);
    return { wrappedDek, kdfParams: newParams, salt: newSalt };
  } finally {
    newKek.fill(0);
    dek.fill(0);
  }
}
