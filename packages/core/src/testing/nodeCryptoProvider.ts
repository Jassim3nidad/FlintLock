import { Buffer } from 'buffer';
import * as nodeCrypto from 'node:crypto';
import { argon2id } from 'hash-wasm';
import { CryptoProvider, KeyHandle } from '../crypto/CryptoProvider';
import {
  Argon2idParams,
  DecryptionError,
  GCM_AUTH_TAG_LENGTH_BYTES,
  GCM_IV_LENGTH_BYTES,
  GcmEnvelope,
  KEY_LENGTH_BYTES,
  KdfParams,
  Pbkdf2Params,
} from '../crypto/types';

const ALGORITHM = 'aes-256-gcm';

/**
 * Reference CryptoProvider backed by Node's built-in `crypto` module plus
 * hash-wasm's WASM Argon2id. Used by packages/core's own test suite (the
 * pure-logic tests: envelope construction, AAD binding, KDF param
 * handling, ...) and as the "reference" side of the shared conformance
 * suite in cryptoProviderConformance.ts — every concrete platform
 * provider (native's QuickCrypto binding, web's WebCrypto binding) is
 * checked against the same KAT vectors this implementation also passes.
 *
 * This validates parameter marshalling, AAD handling, and IV/tag
 * plumbing against a real, independently-implemented OpenSSL backend —
 * it does NOT validate react-native-quick-crypto's or a browser's own
 * native bindings; each platform's own provider needs its own
 * conformance run against real hardware/browser (see phase 3 plan).
 */
function toKeyHandle(bytes: Buffer): KeyHandle {
  return bytes as unknown as KeyHandle;
}
function fromKeyHandle(handle: KeyHandle): Buffer {
  return handle as unknown as Buffer;
}

function deriveKekPbkdf2(password: Buffer, salt: Buffer, params: Pbkdf2Params): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    nodeCrypto.pbkdf2(password, salt, params.iterations, KEY_LENGTH_BYTES, params.digest, (err: Error | null, derivedKey: Buffer) => {
      if (err) return reject(err);
      resolve(derivedKey);
    });
  });
}

async function deriveKekArgon2id(password: Buffer, salt: Buffer, params: Argon2idParams): Promise<Buffer> {
  const hash = await argon2id({
    password,
    salt,
    parallelism: params.parallelism,
    iterations: params.passes,
    memorySize: params.memory,
    hashLength: KEY_LENGTH_BYTES,
    outputType: 'binary',
  });
  return Buffer.from(hash);
}

function deriveKekBytes(password: Buffer, params: KdfParams, salt: Buffer): Promise<Buffer> {
  switch (params.kdf) {
    case 'pbkdf2':
      return deriveKekPbkdf2(password, salt, params);
    case 'argon2id':
      return deriveKekArgon2id(password, salt, params);
    default: {
      const exhaustive: never = params;
      throw new Error(`Unsupported KDF: ${JSON.stringify(exhaustive)}`);
    }
  }
}

function encryptBytes(plaintext: Buffer, key: Buffer, aad?: Buffer): GcmEnvelope {
  if (key.length !== 32) throw new Error('AES-256-GCM key must be 32 bytes');
  const iv = nodeCrypto.randomBytes(GCM_IV_LENGTH_BYTES);
  const cipher = nodeCrypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: GCM_AUTH_TAG_LENGTH_BYTES });
  if (aad) cipher.setAAD(aad, { plaintextLength: plaintext.length });
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return { iv, ciphertext, authTag };
}

function decryptBytes(envelope: GcmEnvelope, key: Buffer, aad?: Buffer): Buffer {
  if (key.length !== 32) throw new Error('AES-256-GCM key must be 32 bytes');
  if (envelope.iv.length !== GCM_IV_LENGTH_BYTES) throw new DecryptionError('Invalid IV length');
  if (envelope.authTag.length !== GCM_AUTH_TAG_LENGTH_BYTES) throw new DecryptionError('Invalid authentication tag length');
  try {
    const decipher = nodeCrypto.createDecipheriv(ALGORITHM, key, envelope.iv, { authTagLength: GCM_AUTH_TAG_LENGTH_BYTES });
    if (aad) decipher.setAAD(aad, { plaintextLength: envelope.ciphertext.length });
    decipher.setAuthTag(envelope.authTag);
    return Buffer.concat([decipher.update(envelope.ciphertext), decipher.final()]);
  } catch {
    throw new DecryptionError();
  }
}

export function createNodeCryptoProvider(): CryptoProvider {
  return {
    randomBytes(length) {
      return nodeCrypto.randomBytes(length);
    },
    async hmac(algorithm, key, data) {
      return nodeCrypto.createHmac(algorithm, key).update(data).digest();
    },
    async hkdf(digest, key, salt, info, length) {
      return Buffer.from(nodeCrypto.hkdfSync(digest, key, salt, info, length));
    },
    async deriveKek(password, params, salt) {
      return toKeyHandle(await deriveKekBytes(password, params, salt));
    },
    async generateDek() {
      return toKeyHandle(nodeCrypto.randomBytes(KEY_LENGTH_BYTES));
    },
    async importKey(rawBytes) {
      return toKeyHandle(Buffer.from(rawBytes));
    },
    async wrapKey(subject, wrappingKey, aad) {
      return encryptBytes(fromKeyHandle(subject), fromKeyHandle(wrappingKey), aad);
    },
    async unwrapKey(envelope, wrappingKey, aad) {
      return toKeyHandle(decryptBytes(envelope, fromKeyHandle(wrappingKey), aad));
    },
    async encrypt(plaintext, key, aad) {
      return encryptBytes(plaintext, fromKeyHandle(key), aad);
    },
    async decrypt(envelope, key, aad) {
      return decryptBytes(envelope, fromKeyHandle(key), aad);
    },
    disposeKey(key) {
      fromKeyHandle(key).fill(0);
    },
  };
}

/** Exposes the raw bytes behind a KeyHandle produced by this provider — test-only, never available in production code. */
export function unsafeKeyHandleBytesForTests(handle: KeyHandle): Buffer {
  return fromKeyHandle(handle);
}
