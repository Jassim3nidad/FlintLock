import { createMMKV, MMKV } from 'react-native-mmkv';

/**
 * A separate MMKV instance from src/storage/native.ts's vault storage —
 * deliberately. This one holds only non-sensitive, device-local UI
 * preferences (theme mode, ...) that need to be readable *before* the
 * vault is unlocked — the lock screen itself needs to know whether to
 * render in dark mode. Nothing sensitive belongs in this store; if it
 * would matter to keep a value secret, it belongs in the vault instead.
 *
 * Lazy for the same reason `vaultStorage` is (see storage/native.ts's
 * longer explanation): eager module-load-time `createMMKV()` would
 * attempt to mmap this store's file unconditionally on every launch,
 * including an iOS background prewarm while the device has never been
 * unlocked this boot. Unlike the vault store, a failure here isn't
 * security-critical — `themePreference.ts` falls back to `'system'`
 * rather than propagating the error, since a wrong/default theme is a
 * cosmetic problem, not a fail-closed one.
 */
let cached: MMKV | null = null;
let cachedError: Error | null = null;

function getInstance(): MMKV {
  if (cached) return cached;
  if (cachedError) throw cachedError;
  try {
    cached = createMMKV({ id: 'flintlock-preferences' });
    return cached;
  } catch (err) {
    cachedError = err instanceof Error ? err : new Error(String(err));
    throw cachedError;
  }
}

export const preferencesStorage: MMKV = new Proxy({} as MMKV, {
  get(_target, prop, _receiver) {
    const instance = getInstance();
    const value = Reflect.get(instance, prop, instance);
    return typeof value === 'function' ? value.bind(instance) : value;
  },
});

/** Test-only: clears the memoized instance/error so each test starts clean. */
export function resetPreferencesStorageForTests(): void {
  cached = null;
  cachedError = null;
}
