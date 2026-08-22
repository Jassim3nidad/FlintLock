import { Buffer } from 'buffer';
import { GCM_AUTH_TAG_LENGTH_BYTES, GCM_IV_LENGTH_BYTES, GcmEnvelope } from '../crypto/types';

/**
 * Packs a GCM envelope into one buffer for a single storage read/write per
 * record: [12-byte IV][16-byte auth tag][ciphertext]. Fixed-offset, not
 * length-prefixed — IV and tag lengths are protocol constants, not
 * per-record data.
 */
export function packEnvelope(envelope: GcmEnvelope): Buffer {
  return Buffer.concat([envelope.iv, envelope.authTag, envelope.ciphertext]);
}

export function unpackEnvelope(packed: Buffer): GcmEnvelope {
  if (packed.length < GCM_IV_LENGTH_BYTES + GCM_AUTH_TAG_LENGTH_BYTES) {
    throw new Error('Corrupt record: buffer too short to contain an IV and auth tag');
  }
  // Buffer.from(view) here (rather than .subarray()) because this
  // polyfill's subarray() inherits Uint8Array's own return type, not
  // Buffer's — this rewraps into a real Buffer instead of fighting that.
  const iv = Buffer.from(packed.subarray(0, GCM_IV_LENGTH_BYTES));
  const authTag = Buffer.from(packed.subarray(GCM_IV_LENGTH_BYTES, GCM_IV_LENGTH_BYTES + GCM_AUTH_TAG_LENGTH_BYTES));
  const ciphertext = Buffer.from(packed.subarray(GCM_IV_LENGTH_BYTES + GCM_AUTH_TAG_LENGTH_BYTES));
  return { iv, authTag, ciphertext };
}
