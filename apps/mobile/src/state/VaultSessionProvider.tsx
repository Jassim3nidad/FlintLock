import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { Buffer, ClipboardManager, getBiometricKeySource, KdfParams, SessionClipboardGuard, UnlockSession, VaultStore } from '@flintlock/core';

interface VaultSessionContextValue {
  session: UnlockSession;
  isUnlocked: boolean;
  vaultExists: boolean;
  createVault: (password: Buffer, kdfParams?: KdfParams) => Promise<void>;
  unlockWithPassword: (password: Buffer) => Promise<void>;
  unlockWithBiometrics: () => Promise<boolean>;
  lock: () => void;
  refreshVaultExists: () => Promise<void>;
  /**
   * The one ClipboardManager instance for the whole unlocked session —
   * screens use this to copy values, never their own instance, so
   * SessionClipboardGuard's session-scoped clear-on-lock (see that
   * class's doc comment for the full three-leg design) actually covers
   * whatever they copied.
   */
  clipboardManager: ClipboardManager;
  /**
   * True from the moment a lock-triggered clear is confirmed to have
   * failed (checked on next foreground, never at lock time itself — see
   * SessionClipboardGuard) until dismissed. Deliberately carries no
   * information about *what* might still be on the clipboard — the
   * warning exists to avoid a disclosure, not to become one.
   */
  isClipboardWarningActive: boolean;
  dismissClipboardWarning: () => void;
}

const VaultSessionContext = createContext<VaultSessionContextValue | null>(null);

export function VaultSessionProvider({ children }: { children: React.ReactNode }) {
  const sessionRef = useRef<UnlockSession | null>(null);
  if (!sessionRef.current) sessionRef.current = new UnlockSession();
  const session = sessionRef.current;

  const clipboardGuardRef = useRef<SessionClipboardGuard | null>(null);
  if (!clipboardGuardRef.current) clipboardGuardRef.current = new SessionClipboardGuard(session);
  const clipboardGuard = clipboardGuardRef.current;

  const [isUnlocked, setIsUnlocked] = useState(session.isUnlocked);
  const [vaultExists, setVaultExists] = useState(false);
  const [isClipboardWarningActive, setIsClipboardWarningActive] = useState(clipboardGuard.isWarningActive);

  useEffect(() => {
    VaultStore.exists().then(setVaultExists);
  }, []);

  useEffect(() => {
    const unsubscribe = session.onLock(() => setIsUnlocked(false));
    return unsubscribe;
  }, [session]);

  useEffect(() => {
    const unsubscribe = clipboardGuard.onWarningChange(setIsClipboardWarningActive);
    return unsubscribe;
  }, [clipboardGuard]);

  useEffect(() => {
    const handleAppStateChange = (status: AppStateStatus): void => {
      if (status === 'background') {
        session.handleAppBackgrounded();
      } else if (status === 'active') {
        session.handleAppForegrounded();
        // After session foregrounding, per SessionClipboardGuard's own
        // doc comment on ordering: a clear attempted while backgrounded
        // (this app's default lock trigger) can't be trusted without a
        // read-back, and that read-back only means anything once focus
        // is actually back.
        clipboardGuard.handleForeground().catch(() => {});
      }
    };
    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription.remove();
  }, [session, clipboardGuard]);

  /**
   * Unmounting this provider drops React's *reference* to `session`, but
   * `UnlockSession` is a plain object whose auto-lock timer is a real
   * `setTimeout` closed over `this` — nothing about a component unmount
   * cancels that on its own. Without this, an unlocked session that
   * outlives its provider (this component being torn down and
   * remounted, a test harness rendering a fresh provider per test, ...)
   * leaves a live timer — and the DEK/VaultStore it eventually locks —
   * reachable only through that timer's closure, not through anything
   * this render tree still holds. `session.lock()` is idempotent and
   * safe to call unconditionally (a no-op if already locked), so this
   * doesn't need to check `isUnlocked` first.
   */
  useEffect(() => {
    return () => {
      session.lock();
      clipboardGuard.dispose();
    };
  }, [session, clipboardGuard]);

  const value = useMemo<VaultSessionContextValue>(
    () => ({
      session,
      isUnlocked,
      vaultExists,
      refreshVaultExists: async () => setVaultExists(await VaultStore.exists()),
      createVault: async (password, kdfParams) => {
        await VaultStore.create(password, kdfParams);
        setVaultExists(true);
        await session.unlockWithPassword(password);
        setIsUnlocked(true);
      },
      unlockWithPassword: async (password) => {
        await session.unlockWithPassword(password);
        setIsUnlocked(true);
      },
      unlockWithBiometrics: async () => {
        const dek = await getBiometricKeySource().unlock();
        if (!dek) return false;
        await session.unlockWithDek(dek);
        setIsUnlocked(true);
        return true;
      },
      lock: () => session.lock(),
      clipboardManager: clipboardGuard.clipboardManager,
      isClipboardWarningActive,
      dismissClipboardWarning: () => clipboardGuard.dismissWarning(),
    }),
    [session, isUnlocked, vaultExists, clipboardGuard, isClipboardWarningActive]
  );

  return <VaultSessionContext.Provider value={value}>{children}</VaultSessionContext.Provider>;
}

export function useVaultSession(): VaultSessionContextValue {
  const ctx = useContext(VaultSessionContext);
  if (!ctx) throw new Error('useVaultSession() must be used within a VaultSessionProvider');
  return ctx;
}
