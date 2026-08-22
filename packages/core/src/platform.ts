import { BiometricKeySource } from './biometric/BiometricKeySource';
import { ClipboardWriter } from './clipboard/ClipboardWriter';
import { CryptoProvider } from './crypto/CryptoProvider';
import { SecureStore } from './storage/SecureStore';

export interface PlatformBindings {
  crypto: CryptoProvider;
  secureStore: SecureStore;
  biometric: BiometricKeySource;
  clipboard: ClipboardWriter;
}

let bindings: PlatformBindings | null = null;

/**
 * Call exactly once, at app startup, before any other @flintlock/core
 * function runs. Each app (apps/mobile, apps/web) supplies its own
 * concrete implementations of the four platform interfaces here — this
 * is the single seam between the platform-agnostic core and everything
 * platform-specific.
 */
export function configurePlatform(p: PlatformBindings): void {
  bindings = p;
}

/** Test-only: clears the configured bindings so each test can configure its own. */
export function resetPlatformForTests(): void {
  bindings = null;
}

function requireBindings(): PlatformBindings {
  if (!bindings) {
    throw new Error('Platform bindings not configured — call configurePlatform() at app startup before using @flintlock/core');
  }
  return bindings;
}

export function getCryptoProvider(): CryptoProvider {
  return requireBindings().crypto;
}

export function getSecureStore(): SecureStore {
  return requireBindings().secureStore;
}

export function getBiometricKeySource(): BiometricKeySource {
  return requireBindings().biometric;
}

export function getClipboardWriter(): ClipboardWriter {
  return requireBindings().clipboard;
}
