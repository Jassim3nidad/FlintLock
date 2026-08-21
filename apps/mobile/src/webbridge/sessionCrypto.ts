import { aesGcmDecrypt, aesGcmEncrypt, Buffer, GCM_AUTH_TAG_LENGTH_BYTES, GCM_IV_LENGTH_BYTES, hkdf } from '../crypto';

const HKDF_INFO = Buffer.from('flintlock-web-bridge-v1', 'utf8');
const SESSION_KEY_LENGTH_BYTES = 32;

/**
 * Derives the per-session AES-256-GCM key from the pairing secret via
 * HKDF-SHA256, salted with the session id (so two sessions from the same
 * pairing secret — which shouldn't happen given single-use enforcement,
 * but defense in depth — never share a key). See
 * docs/WEB_BRIDGE_THREAT_MODEL.md's "Crypto design" section.
 */
export function deriveSessionKey(pairingSecret: Buffer, sessionId: string): Buffer {
  return hkdf('sha256', pairingSecret, Buffer.from(sessionId, 'utf8'), HKDF_INFO, SESSION_KEY_LENGTH_BYTES);
}

/**
 * Encrypts one message for the wire: [12-byte IV][16-byte tag][ciphertext],
 * same packing convention as src/storage/serialization.ts.
 */
export function encryptBridgeMessage(sessionKey: Buffer, plaintextJson: string): Buffer {
  const envelope = aesGcmEncrypt(Buffer.from(plaintextJson, 'utf8'), sessionKey);
  return Buffer.concat([envelope.iv, envelope.authTag, envelope.ciphertext]);
}

/**
 * Decrypts one message from the wire. Throws DecryptionError (from
 * src/crypto) on any failure — including the case in the threat model
 * where the *first* message from a peer that never had the pairing
 * secret fails auth immediately. Callers must drop the connection on
 * failure without distinguishing *why* it failed, to avoid becoming a
 * probing oracle for an unauthenticated connector.
 */
export function decryptBridgeMessage(sessionKey: Buffer, packed: Buffer): string {
  if (packed.length < GCM_IV_LENGTH_BYTES + GCM_AUTH_TAG_LENGTH_BYTES) {
    throw new Error('Message too short to contain an IV and auth tag');
  }
  const iv = packed.subarray(0, GCM_IV_LENGTH_BYTES);
  const authTag = packed.subarray(GCM_IV_LENGTH_BYTES, GCM_IV_LENGTH_BYTES + GCM_AUTH_TAG_LENGTH_BYTES);
  const ciphertext = packed.subarray(GCM_IV_LENGTH_BYTES + GCM_AUTH_TAG_LENGTH_BYTES);
  const plaintext = aesGcmDecrypt({ iv, authTag, ciphertext }, sessionKey);
  return plaintext.toString('utf8');
}
