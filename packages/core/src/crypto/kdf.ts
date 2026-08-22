import { Buffer } from 'buffer';
import { getCryptoProvider } from '../platform';
import { KeyHandle } from './CryptoProvider';
import { KdfParams } from './types';

/**
 * Derives the Key Encryption Key from the master password.
 *
 * This is the only place the master password is read as bytes. Callers
 * are responsible for discarding the input buffer immediately after —
 * see SECURITY.md for the limits of that guarantee in a JS runtime.
 *
 * Returns an opaque KeyHandle, not the KEK's raw bytes (see
 * CryptoProvider.ts) — the actual PBKDF2/Argon2id dispatch and native
 * binding calls live in the platform's concrete CryptoProvider
 * implementation, not here.
 */
export function deriveKek(password: Buffer, params: KdfParams, salt: Buffer): Promise<KeyHandle> {
  return getCryptoProvider().deriveKek(password, params, salt);
}
