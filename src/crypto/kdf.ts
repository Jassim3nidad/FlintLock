import QuickCrypto, { type Buffer } from './native';
import {
  Argon2idParams,
  KEY_LENGTH_BYTES,
  KdfParams,
  PBKDF2_DIGEST,
  Pbkdf2Params,
} from './types';

/**
 * Derives the Key Encryption Key from the master password.
 *
 * This is the only place the master password is read. Callers are
 * responsible for discarding the input buffer immediately after — see
 * SECURITY.md for the limits of that guarantee in a JS runtime.
 *
 * This is a thin primitive wrapper and deliberately does not enforce a
 * minimum salt length — real vault salts are always 32 bytes by
 * construction (envelope.ts's generateSalt()), and enforcing a floor here
 * would reject the RFC 7914 known-answer test vectors, which use salts as
 * short as 4 bytes to test the primitive itself.
 */
export async function deriveKek(password: Buffer, params: KdfParams, salt: Buffer): Promise<Buffer> {
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

function deriveKekPbkdf2(password: Buffer, salt: Buffer, params: Pbkdf2Params): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    QuickCrypto.pbkdf2(password, salt, params.iterations, KEY_LENGTH_BYTES, PBKDF2_DIGEST, (err, derivedKey) => {
      if (err || !derivedKey) return reject(err ?? new Error('pbkdf2 returned no key'));
      resolve(derivedKey);
    });
  });
}

/**
 * Argon2id — proposed alongside PBKDF2 (see docs/CRYPTO.md) as a
 * memory-hard, GPU-resistant alternative. Opt-in per vault; PBKDF2 stays
 * the default so existing vaults never silently change KDF.
 */
async function deriveKekArgon2id(password: Buffer, salt: Buffer, params: Argon2idParams): Promise<Buffer> {
  const result = await new Promise<Buffer>((resolve, reject) => {
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
  return result;
}
