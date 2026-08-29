jest.mock('../native');
jest.mock('../../crypto/native');
jest.mock('react-native', () => ({ Platform: { OS: 'android' } }));

import { BiometricKeyInvalidatedError } from '@flintlock/core';
import { Buffer } from '../../crypto/native';
import { fromKeyHandle, toKeyHandle } from '../../crypto/keyHandleInterop';
import { nativeBiometricKeySource } from '../nativeBiometricKeySource';

// jest.mock('../native') and a direct import of '../__mocks__/native' load
// as two independent module instances — jest.requireMock is the only way
// to reach the exact instance nativeBiometricKeySource.ts itself is using.
const mockNative = jest.requireMock<typeof import('../__mocks__/native')>('../native');

beforeEach(() => {
  mockNative.__reset();
});

describe('nativeBiometricKeySource — contract with the keychain binding', () => {
  it('reports strength "hardware" when biometric hardware is available', async () => {
    expect(await nativeBiometricKeySource.strength()).toBe('hardware');
  });

  it('round-trips the DEK through enroll then unlock', async () => {
    const dek = toKeyHandle(Buffer.alloc(32, 0x7a));
    await nativeBiometricKeySource.enroll(dek);
    const recovered = await nativeBiometricKeySource.unlock();
    expect(recovered).not.toBeNull();
    expect(fromKeyHandle(recovered!).equals(fromKeyHandle(dek))).toBe(true);
  });

  it('enroll() throws when the platform store call itself fails (F13 — was previously untested)', async () => {
    const dek = toKeyHandle(Buffer.alloc(32, 0x99));
    mockNative.__setNextEnrollmentResult(false);

    await expect(nativeBiometricKeySource.enroll(dek)).rejects.toThrow('Failed to store the biometric-gated key');
    // Nothing should have been stored — a later unlock() finds no enrollment.
    expect(await nativeBiometricKeySource.unlock()).toBeNull();
  });

  it('returns null (not an empty/garbage buffer) when no enrollment exists', async () => {
    const recovered = await nativeBiometricKeySource.unlock();
    expect(recovered).toBeNull();
  });

  it('returns null when the biometric prompt is declined or fails, rather than throwing', async () => {
    const dek = toKeyHandle(Buffer.alloc(32, 0x11));
    await nativeBiometricKeySource.enroll(dek);
    mockNative.__setNextBiometricPromptResult(false);
    const recovered = await nativeBiometricKeySource.unlock();
    expect(recovered).toBeNull();
  });

  it('invalidates the enrolled key on a simulated biometric enrollment change: throws BiometricKeyInvalidatedError, and cleans up the stale entry itself', async () => {
    const dek = toKeyHandle(Buffer.alloc(32, 0x22));
    await nativeBiometricKeySource.enroll(dek);
    mockNative.__simulateBiometricEnrollmentChange();

    await expect(nativeBiometricKeySource.unlock()).rejects.toBeInstanceOf(BiometricKeyInvalidatedError);

    // The catch block's own disable() call should have removed the now-
    // dead entry — a *second* unlock() call (no error queued this time)
    // sees a clean "nothing enrolled" state, not a leftover throw.
    expect(await nativeBiometricKeySource.unlock()).toBeNull();
  });

  it('disable() removes the enrollment — master password becomes the only path in again', async () => {
    const dek = toKeyHandle(Buffer.alloc(32, 0x33));
    await nativeBiometricKeySource.enroll(dek);
    await nativeBiometricKeySource.disable();
    expect(await nativeBiometricKeySource.unlock()).toBeNull();
  });

  describe('unlock() — distinguishing a dead key from a merely-failed prompt', () => {
    it('a prompt-level failure code (E_CRYPTO_FAILED — declined, wrong finger, hardware error) returns null, not a throw', async () => {
      const dek = toKeyHandle(Buffer.alloc(32, 0x44));
      await nativeBiometricKeySource.enroll(dek);
      mockNative.__setNextBiometricPromptError('E_CRYPTO_FAILED', 'code: 10, msg: User canceled');

      const recovered = await nativeBiometricKeySource.unlock();

      expect(recovered).toBeNull();
      // Not invalidated — the entry must still be there for a retry.
      expect(await nativeBiometricKeySource.unlock()).not.toBeNull();
    });

    it('a keystore-access failure code (E_KEYSTORE_ACCESS_ERROR) also returns null, not a throw', async () => {
      const dek = toKeyHandle(Buffer.alloc(32, 0x55));
      await nativeBiometricKeySource.enroll(dek);
      mockNative.__setNextBiometricPromptError('E_KEYSTORE_ACCESS_ERROR');

      expect(await nativeBiometricKeySource.unlock()).toBeNull();
    });

    it('the catch-all code (E_UNKNOWN_ERROR) is treated as likely invalidation and throws', async () => {
      const dek = toKeyHandle(Buffer.alloc(32, 0x66));
      await nativeBiometricKeySource.enroll(dek);
      mockNative.__setNextBiometricPromptError('E_UNKNOWN_ERROR', 'some other unexpected native failure');

      await expect(nativeBiometricKeySource.unlock()).rejects.toBeInstanceOf(BiometricKeyInvalidatedError);
    });

    it('an error with no .code at all (unexpected shape) is treated conservatively — returns null, not a throw', async () => {
      const dek = toKeyHandle(Buffer.alloc(32, 0x77));
      await nativeBiometricKeySource.enroll(dek);
      // __setNextBiometricPromptError always sets .code — this models a
      // thrown value that isn't even shaped like react-native-keychain's
      // usual rejection, the case isLikelyInvalidation()'s optional
      // chaining exists for.
      const originalGetGenericPassword = mockNative.Keychain.getGenericPassword;
      mockNative.Keychain.getGenericPassword = async () => {
        throw new Error('totally unexpected shape');
      };

      expect(await nativeBiometricKeySource.unlock()).toBeNull();

      mockNative.Keychain.getGenericPassword = originalGetGenericPassword;
    });
  });
});
