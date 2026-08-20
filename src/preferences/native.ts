import { createMMKV } from 'react-native-mmkv';

/**
 * A separate MMKV instance from src/storage/native.ts's vault storage —
 * deliberately. This one holds only non-sensitive, device-local UI
 * preferences (theme mode, ...) that need to be readable *before* the
 * vault is unlocked — the lock screen itself needs to know whether to
 * render in dark mode. Nothing sensitive belongs in this store; if it
 * would matter to keep a value secret, it belongs in the vault instead.
 */
export const preferencesStorage = createMMKV({ id: 'flintlock-preferences' });
