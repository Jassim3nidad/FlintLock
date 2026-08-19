import { Buffer } from '../crypto/native';
import { GCM_AUTH_TAG_LENGTH_BYTES, GCM_IV_LENGTH_BYTES, GcmEnvelope } from '../crypto';

/**
 * Packs a GCM envelope into one buffer for a single MMKV read/write per
 * record: [12-byte IV][16-byte auth tag][ciphertext]. Fixed-offset, not
 * length-prefixed — IV and tag lengths are protocol constants, not
 * per-record data.
 */
export function packEnvelope(envelope: GcmEnvelope): ArrayBuffer {
  const packed = Buffer.concat([envelope.iv, envelope.authTag, envelope.ciphertext]);
  return packed.buffer.slice(packed.byteOffset, packed.byteOffset + packed.byteLength) as ArrayBuffer;
}

export function unpackEnvelope(packed: ArrayBuffer): GcmEnvelope {
  const buf = Buffer.from(packed);
  if (buf.length < GCM_IV_LENGTH_BYTES + GCM_AUTH_TAG_LENGTH_BYTES) {
    throw new Error('Corrupt record: buffer too short to contain an IV and auth tag');
  }
  const iv = buf.subarray(0, GCM_IV_LENGTH_BYTES);
  const authTag = buf.subarray(GCM_IV_LENGTH_BYTES, GCM_IV_LENGTH_BYTES + GCM_AUTH_TAG_LENGTH_BYTES);
  const ciphertext = buf.subarray(GCM_IV_LENGTH_BYTES + GCM_AUTH_TAG_LENGTH_BYTES);
  return { iv, authTag, ciphertext };
}
