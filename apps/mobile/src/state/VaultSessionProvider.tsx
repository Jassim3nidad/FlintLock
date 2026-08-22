import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { Buffer, getBiometricKeySource, KdfParams, UnlockSession, VaultStore } from '@flintlock/core';

interface VaultSessionContextValue {
  session: UnlockSession;
  isUnlocked: boolean;
  vaultExists: boolean;
  createVault: (password: Buffer, kdfParams?: KdfParams) => Promise<void>;
  unlockWithPassword: (password: Buffer) => Promise<void>;
  unlockWithBiometrics: () => Promise<boolean>;
  lock: () => void;
  refreshVaultExists: () => Promise<void>;
}

const VaultSessionContext = createContext<VaultSessionContextValue | null>(null);

export function VaultSessionProvider({ children }: { children: React.ReactNode }) {
  const sessionRef = useRef<UnlockSession | null>(null);
  if (!sessionRef.current) sessionRef.current = new UnlockSession();
  const session = sessionRef.current;

  const [isUnlocked, setIsUnlocked] = useState(session.isUnlocked);
  const [vaultExists, setVaultExists] = useState(false);

  useEffect(() => {
    VaultStore.exists().then(setVaultExists);
  }, []);

  useEffect(() => {
    const unsubscribe = session.onLock(() => setIsUnlocked(false));
    return unsubscribe;
  }, [session]);

  useEffect(() => {
    const handleAppStateChange = (status: AppStateStatus): void => {
      if (status === 'background') session.handleAppBackgrounded();
      else if (status === 'active') session.handleAppForegrounded();
    };
    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription.remove();
  }, [session]);

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
    }),
    [session, isUnlocked, vaultExists]
  );

  return <VaultSessionContext.Provider value={value}>{children}</VaultSessionContext.Provider>;
}

export function useVaultSession(): VaultSessionContextValue {
  const ctx = useContext(VaultSessionContext);
  if (!ctx) throw new Error('useVaultSession() must be used within a VaultSessionProvider');
  return ctx;
}
