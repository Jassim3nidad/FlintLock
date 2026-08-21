import QuickCrypto, { Buffer } from './native';
import { randomBytes } from './csprng';
import {
  DecryptionError,
  GCM_AUTH_TAG_LENGTH_BYTES,
  GCM_IV_LENGTH_BYTES,
  GcmEnvelope,
} from './types';

const ALGORITHM = 'aes-256-gcm';

/**
 * Encrypts `plaintext` under `key` with a fresh CSPRNG IV. Never pass a
 * caller-supplied or derived IV in — that's how GCM IV reuse happens.
 *
 * @param aad Additional authenticated data. Not encrypted, but tampering
 *   with it (or presenting the ciphertext under different AAD) fails
 *   decryption. Used to bind ciphertext to a record ID + schema version.
 */
export function aesGcmEncrypt(plaintext: Buffer, key: Buffer, aad?: Buffer): GcmEnvelope {
  if (key.length !== 32) throw new Error('AES-256-GCM key must be 32 bytes');

  const iv = randomBytes(GCM_IV_LENGTH_BYTES);
  const cipher = QuickCrypto.createCipheriv(ALGORITHM, key, iv, {
    authTagLength: GCM_AUTH_TAG_LENGTH_BYTES,
  });
  if (aad) cipher.setAAD(aad, { plaintextLength: plaintext.length });

  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return { iv, ciphertext, authTag };
}

/**
 * Decrypts and verifies `envelope`. Throws DecryptionError on any failure —
 * a bad auth tag, wrong AAD, or wrong key all fail the same way. Never
 * returns partial plaintext.
 */
export function aesGcmDecrypt(envelope: GcmEnvelope, key: Buffer, aad?: Buffer): Buffer {
  if (key.length !== 32) throw new Error('AES-256-GCM key must be 32 bytes');
  if (envelope.iv.length !== GCM_IV_LENGTH_BYTES) {
    throw new DecryptionError('Invalid IV length');
  }
  if (envelope.authTag.length !== GCM_AUTH_TAG_LENGTH_BYTES) {
    throw new DecryptionError('Invalid authentication tag length');
  }

  try {
    const decipher = QuickCrypto.createDecipheriv(ALGORITHM, key, envelope.iv, {
      authTagLength: GCM_AUTH_TAG_LENGTH_BYTES,
    });
    if (aad) decipher.setAAD(aad, { plaintextLength: envelope.ciphertext.length });
    decipher.setAuthTag(envelope.authTag);

    return Buffer.concat([decipher.update(envelope.ciphertext), decipher.final()]);
  } catch {
    // GCM tag verification failure (or any other native decrypt error) is
    // always a hard, generic failure — never surface which part failed.
    throw new DecryptionError();
  }
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
