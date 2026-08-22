jest.mock('../native');
jest.mock('../../crypto/native');

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

  it('invalidates the enrolled key on a simulated biometric enrollment change', async () => {
    const dek = toKeyHandle(Buffer.alloc(32, 0x22));
    await nativeBiometricKeySource.enroll(dek);
    mockNative.__simulateBiometricEnrollmentChange();
    const recovered = await nativeBiometricKeySource.unlock();
    expect(recovered).toBeNull();
  });

  it('disable() removes the enrollment — master password becomes the only path in again', async () => {
    const dek = toKeyHandle(Buffer.alloc(32, 0x33));
    await nativeBiometricKeySource.enroll(dek);
    await nativeBiometricKeySource.disable();
    expect(await nativeBiometricKeySource.unlock()).toBeNull();
  });
});
