/**
 * Jest test double for ./native — routes crypto calls through Node's
 * built-in `crypto` module (PBKDF2, AES-256-GCM, CSPRNG) and hash-wasm's
 * WASM Argon2id (native Argon2id isn't callable outside a real RN host).
 *
 * Node's `crypto` and react-native-quick-crypto deliberately share the
 * same API shape, so this validates our wrapper logic — parameter
 * marshalling, AAD handling, IV/tag plumbing — against a real,
 * independently-implemented OpenSSL backend. It does not validate quick-
 * crypto's own native bindings; that requires an on-device/simulator run.
 */
import * as nodeCrypto from 'node:crypto';
import { Buffer } from 'node:buffer';
import { argon2id } from 'hash-wasm';

export { Buffer };

const QuickCrypto = {
  randomBytes: (size: number): Buffer => nodeCrypto.randomBytes(size),

  pbkdf2: (
    password: Buffer,
    salt: Buffer,
    iterations: number,
    keylen: number,
    digest: string,
    callback: (err: Error | null, derivedKey?: Buffer) => void
  ): void => {
    nodeCrypto.pbkdf2(password, salt, iterations, keylen, digest, callback);
  },

  createCipheriv: nodeCrypto.createCipheriv,
  createDecipheriv: nodeCrypto.createDecipheriv,
  createHmac: nodeCrypto.createHmac,

  argon2: (
    algorithm: string,
    params: {
      message: Buffer;
      nonce: Buffer;
      parallelism: number;
      tagLength: number;
      memory: number;
      passes: number;
    },
    callback: (err: Error | null, result: Buffer) => void
  ): void => {
    if (algorithm !== 'argon2id') {
      callback(new Error(`Test double only implements argon2id, got ${algorithm}`), Buffer.alloc(0));
      return;
    }
    argon2id({
      password: params.message,
      salt: params.nonce,
      parallelism: params.parallelism,
      iterations: params.passes,
      memorySize: params.memory,
      hashLength: params.tagLength,
      outputType: 'binary',
    })
      .then((hash) => callback(null, Buffer.from(hash)))
      .catch((err) => callback(err instanceof Error ? err : new Error(String(err)), Buffer.alloc(0)));
  },
};

export default QuickCrypto;
