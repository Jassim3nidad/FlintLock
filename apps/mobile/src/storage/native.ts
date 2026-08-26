import { createMMKV, MMKV } from 'react-native-mmkv';

/**
 * Single import point for the storage binding — mirrors src/crypto/native.ts.
 * Every other module in src/storage imports `vaultStorage` from here, never
 * `react-native-mmkv` directly, so Jest can substitute the library's own
 * createMockMMKV() without touching production code paths.
 *
 * Deliberately not using MMKV's built-in encryptionKey option: all
 * confidentiality and integrity guarantees for vault data come from our
 * own AES-256-GCM envelope layer (src/crypto). Layering MMKV's own AES-CFB
 * encryption underneath would mean two overlapping encryption schemes
 * with separate key material and no clearer combined guarantee — one
 * well-understood, audited boundary is preferable to two half-understood
 * ones. MMKV here is a plain, unencrypted local key-value store; every
 * value it holds for vault content is already our own ciphertext.
 *
 * **`vaultStorage` is a lazy proxy, not an eagerly-created instance —
 * deliberately.** `createMMKV()` calls into `mmap()` on the vault's
 * backing file, which is protected under `NSFileProtectionCompleteUnlessOpen`
 * on iOS (see apps/mobile/ios/Flintlock/AppDelegate.swift's
 * `hardenMmkvDirectory()`). That protection class denies a *first* open
 * of the file until the device has been unlocked at least once since
 * boot — and iOS can launch this app in the background with no user
 * interaction at all (system "prewarming" for launch-time optimization,
 * silent push handling, background refresh), including while the device
 * is still locked and has never been unlocked this boot. A plain
 * `export const vaultStorage = createMMKV(...)` would attempt that
 * `mmap()` unconditionally the instant this module is first imported —
 * which happens as an unavoidable side effect of the JS bundle evaluating
 * during `didFinishLaunchingWithOptions`, regardless of whether the
 * launch is a real foreground one or a silent prewarm the user never
 * sees.
 *
 * `react-native-mmkv`'s failure mode for an unopenable backing file is
 * not guaranteed to be a catchable JS exception — MMKV's native C++ core
 * has a documented history, particularly on iOS under Data-Protection-
 * class file-access failures, of hard process aborts rather than
 * recoverable errors. No JS-side try/catch can save you from a native
 * abort that never returns control to JS. What this *can* do: (a) defer
 * the open attempt until something in the app actually touches storage,
 * rather than at raw module-import time — shrinking the window in which
 * the attempt happens at all during a prewarm that renders nothing a
 * real user will ever interact with — and (b) turn whatever failure mode
 * *is* catchable into a clean, propagated error `nativeSecureStore.ts`
 * can surface as a normal rejected promise, rather than an unhandled
 * throw at import time that would otherwise crash the whole bundle
 * evaluation before the app can render anything at all, including the
 * unlock screen.
 */
let cached: MMKV | null = null;
let cachedError: Error | null = null;

function getInstance(): MMKV {
  if (cached) return cached;
  if (cachedError) throw cachedError;
  try {
    cached = createMMKV({ id: 'flintlock-vault' });
    return cached;
  } catch (err) {
    // Cached so a failed-to-open state doesn't retry (and potentially
    // re-trigger whatever native failure this was) on every single call
    // within the app session — resetVaultStorageForTests() clears it for
    // tests; production retries happen via nativeSecureStore.ts's
    // foreground-triggered retry path once the device is actually
    // unlocked, not by hammering this constructor again immediately.
    cachedError = err instanceof Error ? err : new Error(String(err));
    throw cachedError;
  }
}

export const vaultStorage: MMKV = new Proxy({} as MMKV, {
  get(_target, prop, _receiver) {
    const instance = getInstance();
    const value = Reflect.get(instance, prop, instance);
    return typeof value === 'function' ? value.bind(instance) : value;
  },
});

/** Test-only: clears the memoized instance/error so each test starts clean. */
export function resetVaultStorageForTests(): void {
  cached = null;
  cachedError = null;
}
