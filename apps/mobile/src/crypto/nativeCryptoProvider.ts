import {
  Argon2idParams,
  Buffer as CoreBuffer,
  CryptoProvider,
  DecryptionError,
  GCM_AUTH_TAG_LENGTH_BYTES,
  GCM_IV_LENGTH_BYTES,
  GcmEnvelope as CoreGcmEnvelope,
  KEY_LENGTH_BYTES,
  KdfParams,
  KeyHandle,
  PBKDF2_DIGEST,
  Pbkdf2Params,
} from '@flintlock/core';
import { fromKeyHandle, toKeyHandle } from './keyHandleInterop';
import QuickCrypto, { Buffer } from './native';

const ALGORITHM = 'aes-256-gcm';

/**
 * Everything in this file up to nativeCryptoProvider itself works in
 * react-native-quick-crypto's own Buffer type. Only nativeCryptoProvider's
 * methods cross into @flintlock/core's CryptoProvider surface, where
 * Buffer means the `buffer` npm package's type — structurally identical
 * at runtime, nominally distinct to TypeScript, so every value crossing
 * that boundary is explicitly rewrapped with Buffer.from() rather than
 * cast, in either direction.
 */
interface NativeGcmEnvelope {
  iv: Buffer;
  ciphertext: Buffer;
  authTag: Buffer;
}

function toCoreEnvelope(envelope: NativeGcmEnvelope): CoreGcmEnvelope {
  return {
    iv: CoreBuffer.from(envelope.iv),
    ciphertext: CoreBuffer.from(envelope.ciphertext),
    authTag: CoreBuffer.from(envelope.authTag),
  };
}

function toNativeEnvelope(envelope: CoreGcmEnvelope): NativeGcmEnvelope {
  return {
    iv: Buffer.from(envelope.iv),
    ciphertext: Buffer.from(envelope.ciphertext),
    authTag: Buffer.from(envelope.authTag),
  };
}

function deriveKekPbkdf2(password: Buffer, salt: Buffer, params: Pbkdf2Params): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    QuickCrypto.pbkdf2(password, salt, params.iterations, KEY_LENGTH_BYTES, PBKDF2_DIGEST, (err, derivedKey) => {
      if (err || !derivedKey) return reject(err ?? new Error('pbkdf2 returned no key'));
      resolve(derivedKey);
    });
  });
}

/** Argon2id — opt-in per vault; PBKDF2 stays the default so existing vaults never silently change KDF. */
function deriveKekArgon2id(password: Buffer, salt: Buffer, params: Argon2idParams): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    QuickCrypto.argon2(
      'argon2id',
      {
        message: password,
        nonce: salt,
        parallelism: params.parallelism,
        tagLength: KEY_LENGTH_BYTES,
        memory: params.memory,
        passes: params.passes,
      },
      (err, derivedKey) => {
        if (err || !derivedKey) return reject(err ?? new Error('argon2 returned no key'));
        resolve(derivedKey);
      }
    );
  });
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

/** Fresh CSPRNG IV for every single call — never reused, never derived from a resettable counter. */
function encryptBytes(plaintext: Buffer, key: Buffer, aad?: Buffer): NativeGcmEnvelope {
  if (key.length !== 32) throw new Error('AES-256-GCM key must be 32 bytes');

  const iv = QuickCrypto.randomBytes(GCM_IV_LENGTH_BYTES);
  const cipher = QuickCrypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: GCM_AUTH_TAG_LENGTH_BYTES });
  if (aad) cipher.setAAD(aad, { plaintextLength: plaintext.length });

  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return { iv, ciphertext, authTag };
}

/** Rejects with DecryptionError on any failure — a bad auth tag, wrong AAD, or wrong key all fail the same way. */
function decryptBytes(envelope: NativeGcmEnvelope, key: Buffer, aad?: Buffer): Buffer {
  if (key.length !== 32) throw new Error('AES-256-GCM key must be 32 bytes');
  if (envelope.iv.length !== GCM_IV_LENGTH_BYTES) throw new DecryptionError('Invalid IV length');
  if (envelope.authTag.length !== GCM_AUTH_TAG_LENGTH_BYTES) throw new DecryptionError('Invalid authentication tag length');

  try {
    const decipher = QuickCrypto.createDecipheriv(ALGORITHM, key, envelope.iv, { authTagLength: GCM_AUTH_TAG_LENGTH_BYTES });
    if (aad) decipher.setAAD(aad, { plaintextLength: envelope.ciphertext.length });
    decipher.setAuthTag(envelope.authTag);
    return Buffer.concat([decipher.update(envelope.ciphertext), decipher.final()]);
  } catch {
    throw new DecryptionError();
  }
}

export const nativeCryptoProvider: CryptoProvider = {
  randomBytes(length: number) {
    return CoreBuffer.from(QuickCrypto.randomBytes(length));
  },

  async hmac(algorithm, key: CoreBuffer, data: CoreBuffer) {
    const digest = QuickCrypto.createHmac(algorithm, Buffer.from(key)).update(Buffer.from(data)).digest();
    return CoreBuffer.from(digest);
  },

  async hkdf(digest, key: CoreBuffer, salt: CoreBuffer, info: CoreBuffer, length) {
    const result = QuickCrypto.hkdfSync(digest, Buffer.from(key), Buffer.from(salt), Buffer.from(info), length);
    return CoreBuffer.from(result);
  },

  async deriveKek(password: CoreBuffer, params, salt: CoreBuffer) {
    const kek = await deriveKekBytes(Buffer.from(password), params, Buffer.from(salt));
    return toKeyHandle(kek);
  },

  async generateDek() {
    return toKeyHandle(QuickCrypto.randomBytes(KEY_LENGTH_BYTES));
  },

  async importKey(rawBytes: CoreBuffer) {
    return toKeyHandle(Buffer.from(rawBytes));
  },

  async wrapKey(subject: KeyHandle, wrappingKey: KeyHandle, aad: CoreBuffer) {
    const envelope = encryptBytes(fromKeyHandle(subject), fromKeyHandle(wrappingKey), Buffer.from(aad));
    return toCoreEnvelope(envelope);
  },

  async unwrapKey(envelope: CoreGcmEnvelope, wrappingKey: KeyHandle, aad: CoreBuffer) {
    const dek = decryptBytes(toNativeEnvelope(envelope), fromKeyHandle(wrappingKey), Buffer.from(aad));
    return toKeyHandle(dek);
  },

  async encrypt(plaintext: CoreBuffer, key: KeyHandle, aad?: CoreBuffer) {
    const envelope = encryptBytes(Buffer.from(plaintext), fromKeyHandle(key), aad ? Buffer.from(aad) : undefined);
    return toCoreEnvelope(envelope);
  },

  async decrypt(envelope: CoreGcmEnvelope, key: KeyHandle, aad?: CoreBuffer) {
    const plaintext = decryptBytes(toNativeEnvelope(envelope), fromKeyHandle(key), aad ? Buffer.from(aad) : undefined);
    return CoreBuffer.from(plaintext);
  },

  disposeKey(key: KeyHandle) {
    fromKeyHandle(key).fill(0);
  },
};
