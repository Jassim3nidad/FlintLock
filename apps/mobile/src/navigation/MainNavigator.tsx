import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { VaultListScreen } from '../screens/VaultListScreen';
import { CredentialDetailScreen } from '../screens/CredentialDetailScreen';
import { CredentialFormScreen } from '../screens/CredentialFormScreen';
import { AddTotpScreen } from '../screens/AddTotpScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { TagManagementScreen } from '../screens/TagManagementScreen';
import { SecurityDashboardScreen } from '../screens/SecurityDashboardScreen';
import { ExportScreen } from '../screens/ExportScreen';
import { ImportScreen } from '../screens/ImportScreen';
import { WebBridgePairingScreen } from '../screens/WebBridgePairingScreen';
import type { MainStackParamList } from './types';

const Stack = createNativeStackNavigator<MainStackParamList>();

export function MainNavigator() {
  return (
    <Stack.Navigator>
      <Stack.Screen name="VaultList" component={VaultListScreen} options={{ headerShown: false }} />
      <Stack.Screen name="CredentialDetail" component={CredentialDetailScreen} options={{ title: 'Credential' }} />
      <Stack.Screen name="CredentialForm" component={CredentialFormScreen} options={{ title: 'Credential' }} />
      <Stack.Screen name="AddTotp" component={AddTotpScreen} options={{ title: 'Authenticator' }} />
      <Stack.Screen name="Settings" component={SettingsScreen} options={{ headerShown: false }} />
      <Stack.Screen name="TagManagement" component={TagManagementScreen} options={{ headerShown: false }} />
      <Stack.Screen name="SecurityDashboard" component={SecurityDashboardScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Export" component={ExportScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Import" component={ImportScreen} options={{ headerShown: false }} />
      <Stack.Screen name="WebBridge" component={WebBridgePairingScreen} options={{ headerShown: false }} />
    </Stack.Navigator>
  );
}
