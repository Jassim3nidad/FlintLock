import React, { useState } from 'react';
import { Switch, Text, View } from 'react-native';
import { StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Screen } from '../components/Screen';
import { Button } from '../components/Button';
import { TextField } from '../components/TextField';
import { OptionRow } from '../components/OptionRow';
import { useTheme, useThemePreference } from '../theme/ThemeProvider';
import { ThemePreference } from '../preferences/themePreference';
import { useVaultSession } from '../state/VaultSessionProvider';
import { VaultSettings } from '../storage/schema';
import { VaultStore } from '../storage/vaultStore';
import { Buffer, DecryptionError } from '../crypto';
import { enrollBiometricUnlock, disableBiometricUnlock, isBiometricHardwareAvailable } from '../biometric/biometricVault';
import type { MainStackParamList } from '../navigation/types';

const AUTO_LOCK_OPTIONS: VaultSettings['autoLock'][] = ['immediate', '30s', '1m', '5m', '15m', '30m', 'never'];
const THEME_OPTIONS: ThemePreference[] = ['system', 'light', 'dark'];

type Nav = NativeStackNavigationProp<MainStackParamList>;

export function SettingsScreen() {
  const theme = useTheme();
  const navigation = useNavigation<Nav>();
  const { session, lock } = useVaultSession();
  const [preference, setPreference] = useThemePreference();
  const [settings, setSettings] = useState(session.vault.settings);
  const [biometricBusy, setBiometricBusy] = useState(false);
  const [biometricError, setBiometricError] = useState<string | null>(null);
  const [confirmingPassword, setConfirmingPassword] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState('');

  const updateSettings = (patch: Partial<VaultSettings>): void => {
    session.vault.updateSettings(patch);
    setSettings({ ...settings, ...patch });
  };

  const handleBiometricToggle = async (enabled: boolean): Promise<void> => {
    setBiometricError(null);
    if (!enabled) {
      await disableBiometricUnlock();
      updateSettings({ biometricUnlockEnabled: false });
      return;
    }

    const available = await isBiometricHardwareAvailable();
    if (!available) {
      setBiometricError('No biometric hardware is available or enrolled on this device.');
      return;
    }
    // Enrollment requires the master password again, even though the
    // session is already unlocked (spec: biometrics wrap a copy of the
    // DEK, and enrolling that copy needs the password re-confirmed).
    setConfirmingPassword(true);
  };

  const handleConfirmEnrollment = async (): Promise<void> => {
    setBiometricBusy(true);
    setBiometricError(null);
    let passwordBuffer: Buffer | null = null;
    try {
      passwordBuffer = Buffer.from(confirmPassword, 'utf8');
      const dek = await VaultStore.verifyPasswordAndGetDek(passwordBuffer);
      try {
        await enrollBiometricUnlock(dek);
      } finally {
        dek.fill(0);
      }
      updateSettings({ biometricUnlockEnabled: true });
      setConfirmingPassword(false);
    } catch (e) {
      setBiometricError(e instanceof DecryptionError ? 'Incorrect master password' : 'Could not enable biometric unlock');
    } finally {
      passwordBuffer?.fill(0);
      setBiometricBusy(false);
      setConfirmPassword('');
    }
  };

  return (
    <Screen scroll>
      <Text style={[styles.title, { color: theme.colors.textPrimary, fontSize: theme.typography.title.fontSize }]}>
        Settings
      </Text>

      <Text style={[styles.sectionLabel, { color: theme.colors.textSecondary }]}>Auto-lock</Text>
      <OptionRow options={AUTO_LOCK_OPTIONS} selected={settings.autoLock} onSelect={(v) => updateSettings({ autoLock: v })} />

      <View style={styles.row}>
        <Text style={{ color: theme.colors.textPrimary }}>Lock when app backgrounds</Text>
        <Switch
          testID="lock-on-background-switch"
          value={settings.lockOnBackground}
          onValueChange={(v) => updateSettings({ lockOnBackground: v })}
        />
      </View>

      <View style={styles.row}>
        <Text style={{ color: theme.colors.textPrimary }}>Biometric unlock</Text>
        <Switch
          testID="biometric-switch"
          value={settings.biometricUnlockEnabled}
          disabled={biometricBusy}
          onValueChange={(v) => {
            handleBiometricToggle(v).catch(() => {});
          }}
        />
      </View>

      {confirmingPassword && (
        <View testID="biometric-confirm-panel" style={[styles.confirmPanel, { backgroundColor: theme.colors.surface, borderRadius: theme.radius.md }]}>
          <Text style={[styles.confirmIntro, { color: theme.colors.textSecondary }]}>
            Confirm your master password to enable biometric unlock.
          </Text>
          <TextField label="Master password" testID="biometric-confirm-password" isPassword value={confirmPassword} onChangeText={setConfirmPassword} />
          <Button label="Confirm" onPress={handleConfirmEnrollment} loading={biometricBusy} testID="biometric-confirm-button" />
        </View>
      )}
      {biometricError && (
        <Text testID="biometric-error" style={[styles.errorText, { color: theme.colors.danger }]}>
          {biometricError}
        </Text>
      )}

      <Text style={[styles.sectionLabel, { color: theme.colors.textSecondary }]}>Appearance</Text>
      <OptionRow options={THEME_OPTIONS} selected={preference} onSelect={setPreference} />

      <Text style={[styles.sectionLabel, { color: theme.colors.textSecondary }]}>Data</Text>
      <Button label="Export vault" onPress={() => navigation.navigate('Export')} variant="secondary" testID="export-nav-button" />
      <View style={styles.spacer} />
      <Button label="Import vault" onPress={() => navigation.navigate('Import')} variant="secondary" testID="import-nav-button" />
      <View style={styles.spacer} />
      <Button label="Transfer to desktop (Web Bridge)" onPress={() => navigation.navigate('WebBridge')} variant="secondary" testID="web-bridge-nav-button" />

      <View style={styles.spacer} />
      <Button label="Lock now" onPress={lock} variant="secondary" testID="lock-now-button" />
      <View style={styles.spacer} />
      <Button label="Back" onPress={() => navigation.goBack()} variant="secondary" testID="back-button" />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontWeight: '700', marginBottom: 24 },
  sectionLabel: { fontSize: 13, fontWeight: '600', marginBottom: 8, marginTop: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  confirmPanel: { padding: 16, marginBottom: 16 },
  confirmIntro: { marginBottom: 12 },
  errorText: { marginBottom: 16 },
  spacer: { height: 12 },
});
