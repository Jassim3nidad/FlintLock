import {
  aesGcmDecrypt,
  aesGcmEncrypt,
  Buffer,
  GCM_AUTH_TAG_LENGTH_BYTES,
  GCM_IV_LENGTH_BYTES,
  getCryptoProvider,
  hkdf,
  KeyHandle,
} from '@flintlock/core';

const HKDF_INFO = Buffer.from('flintlock-web-bridge-v1', 'utf8');
const SESSION_KEY_LENGTH_BYTES = 32;

/**
 * Derives the per-session AES-256-GCM key from the pairing secret via
 * HKDF-SHA256, salted with the session id (so two sessions from the same
 * pairing secret — which shouldn't happen given single-use enforcement,
 * but defense in depth — never share a key). See
 * docs/WEB_BRIDGE_THREAT_MODEL.md's "Crypto design" section.
 *
 * Returns a KeyHandle, not raw bytes: the derived session key is
 * structural key material from here on, same treatment as the vault's
 * own DEK/KEK (see CryptoProvider.ts).
 */
export async function deriveSessionKey(pairingSecret: Buffer, sessionId: string): Promise<KeyHandle> {
  const raw = await hkdf('sha256', pairingSecret, Buffer.from(sessionId, 'utf8'), HKDF_INFO, SESSION_KEY_LENGTH_BYTES);
  return getCryptoProvider().importKey(raw);
}

/**
 * Encrypts one message for the wire: [12-byte IV][16-byte tag][ciphertext],
 * same packing convention as packages/core/src/storage/serialization.ts.
 */
export async function encryptBridgeMessage(sessionKey: KeyHandle, plaintextJson: string): Promise<Buffer> {
  const envelope = await aesGcmEncrypt(Buffer.from(plaintextJson, 'utf8'), sessionKey);
  return Buffer.concat([envelope.iv, envelope.authTag, envelope.ciphertext]);
}

/**
 * Decrypts one message from the wire. Rejects with DecryptionError (from
 * @flintlock/core) on any failure — including the case in the threat
 * model where the *first* message from a peer that never had the
 * pairing secret fails auth immediately. Callers must drop the
 * connection on failure without distinguishing *why* it failed, to avoid
 * becoming a probing oracle for an unauthenticated connector.
 */
export async function decryptBridgeMessage(sessionKey: KeyHandle, packed: Buffer): Promise<string> {
  if (packed.length < GCM_IV_LENGTH_BYTES + GCM_AUTH_TAG_LENGTH_BYTES) {
    throw new Error('Message too short to contain an IV and auth tag');
  }
  const iv = packed.subarray(0, GCM_IV_LENGTH_BYTES);
  const authTag = packed.subarray(GCM_IV_LENGTH_BYTES, GCM_IV_LENGTH_BYTES + GCM_AUTH_TAG_LENGTH_BYTES);
  const ciphertext = packed.subarray(GCM_IV_LENGTH_BYTES + GCM_AUTH_TAG_LENGTH_BYTES);
  const plaintext = await aesGcmDecrypt({ iv, authTag, ciphertext }, sessionKey);
  return plaintext.toString('utf8');
}
