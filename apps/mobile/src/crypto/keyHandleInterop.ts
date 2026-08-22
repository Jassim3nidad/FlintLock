import { KeyHandle } from '@flintlock/core';
import { Buffer } from './native';

/**
 * Native's KeyHandle is a Buffer under the hood — these two casts are the
 * only sanctioned way to cross that boundary, and only from
 * platform-specific native code (nativeCryptoProvider.ts,
 * nativeBiometricKeySource.ts). packages/core never sees this file and
 * can't perform the cast itself; that's the whole point of the branded
 * KeyHandle type.
 */
export function toKeyHandle(bytes: Buffer): KeyHandle {
  return bytes as unknown as KeyHandle;
}

export function fromKeyHandle(handle: KeyHandle): Buffer {
  return handle as unknown as Buffer;
}
