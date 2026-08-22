import { Buffer } from 'buffer';
import { getCryptoProvider } from '../platform';
import { KeyHandle } from './CryptoProvider';
import { GcmEnvelope } from './types';

/**
 * Encrypts `plaintext` under `key` with a fresh CSPRNG IV (generated
 * inside the concrete CryptoProvider — never a caller-supplied or
 * derived IV, that's how GCM IV reuse happens).
 *
 * @param aad Additional authenticated data. Not encrypted, but tampering
 *   with it (or presenting the ciphertext under different AAD) fails
 *   decryption. Used to bind ciphertext to a record ID + schema version.
 */
export function aesGcmEncrypt(plaintext: Buffer, key: KeyHandle, aad?: Buffer): Promise<GcmEnvelope> {
  return getCryptoProvider().encrypt(plaintext, key, aad);
}

/**
 * Decrypts and verifies `envelope`. Rejects with DecryptionError on any
 * failure — a bad auth tag, wrong AAD, or wrong key all fail the same
 * way. Never returns partial plaintext.
 */
export function aesGcmDecrypt(envelope: GcmEnvelope, key: KeyHandle, aad?: Buffer): Promise<Buffer> {
  return getCryptoProvider().decrypt(envelope, key, aad);
}

/**
 * Binds a record's ciphertext to its record ID and schema version via GCM
 * AAD, so records can't be swapped or replayed between vaults.
 *
 * Length-prefixed rather than delimiter-joined: a naive `${id}:${version}`
 * string is ambiguous (id="a:1", version=2 collides with id="a", version="1:2").
 */
export function recordAad(recordId: string, schemaVersion: number): Buffer {
  const idBytes = Buffer.from(recordId, 'utf8');
  const header = Buffer.alloc(8);
  header.writeUInt32BE(idBytes.length, 0);
  header.writeUInt32BE(schemaVersion, 4);
  return Buffer.concat([header, idBytes]);
}
