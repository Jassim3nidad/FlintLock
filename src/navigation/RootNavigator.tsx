import React from 'react';
import { useVaultSession } from '../state/VaultSessionProvider';
import { CreateVaultScreen } from '../screens/CreateVaultScreen';
import { UnlockScreen } from '../screens/UnlockScreen';
import { MainNavigator } from './MainNavigator';

/**
 * Not a react-navigation stack — a plain conditional render. There is no
 * back button from CreateVault to Unlock or from Unlock into the vault;
 * those transitions are driven entirely by vaultExists/isUnlocked, not
 * user-navigable history. The vault itself (MainNavigator) is the first
 * point where "screens with a back stack" actually makes sense.
 */
export function RootNavigator() {
  const { vaultExists, isUnlocked } = useVaultSession();

  if (!vaultExists) return <CreateVaultScreen />;
  if (!isUnlocked) return <UnlockScreen />;
  return <MainNavigator />;
}
