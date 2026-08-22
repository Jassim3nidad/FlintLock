import { BiometricKeySource, BiometricStrength } from '../biometric/BiometricKeySource';
import { KeyHandle } from '../crypto/CryptoProvider';

/** Minimal BiometricKeySource stub — core's own logic never calls into this, it exists so tests can build a full PlatformBindings. */
export function createStubBiometricKeySource(strength: BiometricStrength = 'unsupported'): BiometricKeySource {
  let enrolled: KeyHandle | null = null;
  return {
    async strength() {
      return strength;
    },
    async enroll(dek) {
      enrolled = dek;
    },
    async unlock() {
      return enrolled;
    },
    async disable() {
      enrolled = null;
    },
  };
}
