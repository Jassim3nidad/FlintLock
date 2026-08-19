jest.mock('../native');
jest.mock('../../crypto/native');

import { Buffer } from '../../crypto';
import {
  disableBiometricUnlock,
  enrollBiometricUnlock,
  isBiometricHardwareAvailable,
  unlockWithBiometrics,
} from '../biometricVault';

// jest.mock('../native') and a direct import of '../__mocks__/native' load
// as two independent module instances — jest.requireMock is the only way
// to reach the exact instance biometricVault.ts itself is using.
const mockNative = jest.requireMock<typeof import('../__mocks__/native')>('../native');

beforeEach(() => {
  mockNative.__reset();
});

describe('biometric-gated DEK storage — contract with the keychain binding', () => {
  it('reports hardware availability', async () => {
    expect(await isBiometricHardwareAvailable()).toBe(true);
  });

  it('round-trips the DEK through enroll then unlock', async () => {
    const dek = Buffer.alloc(32, 0x7a);
    await enrollBiometricUnlock(dek);
    const recovered = await unlockWithBiometrics();
    expect(recovered).not.toBeNull();
    expect(recovered!.equals(dek)).toBe(true);
  });

  it('returns null (not an empty/garbage buffer) when no enrollment exists', async () => {
    const recovered = await unlockWithBiometrics();
    expect(recovered).toBeNull();
  });

  it('returns null when the biometric prompt is declined or fails, rather than throwing', async () => {
    const dek = Buffer.alloc(32, 0x11);
    await enrollBiometricUnlock(dek);
    mockNative.__setNextBiometricPromptResult(false);
    const recovered = await unlockWithBiometrics();
    expect(recovered).toBeNull();
  });

  it('invalidates the enrolled key on a simulated biometric enrollment change', async () => {
    const dek = Buffer.alloc(32, 0x22);
    await enrollBiometricUnlock(dek);
    mockNative.__simulateBiometricEnrollmentChange();
    const recovered = await unlockWithBiometrics();
    expect(recovered).toBeNull();
  });

  it('disableBiometricUnlock removes the enrollment — master password becomes the only path in again', async () => {
    const dek = Buffer.alloc(32, 0x33);
    await enrollBiometricUnlock(dek);
    await disableBiometricUnlock();
    expect(await unlockWithBiometrics()).toBeNull();
  });
});
