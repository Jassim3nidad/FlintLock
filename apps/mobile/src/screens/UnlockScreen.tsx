import React, { useEffect, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { Screen } from '../components/Screen';
import { TextField } from '../components/TextField';
import { Button } from '../components/Button';
import { useTheme } from '../theme/ThemeProvider';
import { useVaultSession } from '../state/VaultSessionProvider';
import { BiometricKeyInvalidatedError, Buffer, DecryptionError, getBiometricKeySource, VaultStore } from '@flintlock/core';

export function UnlockScreen() {
  const theme = useTheme();
  const { unlockWithPassword, unlockWithBiometrics } = useVaultSession();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showBiometricButton, setShowBiometricButton] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const settings = await VaultStore.peekSettings();
      if (!settings?.biometricUnlockEnabled) return;
      const strength = await getBiometricKeySource().strength();
      if (!cancelled) setShowBiometricButton(strength !== 'unsupported');
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleUnlock = async (): Promise<void> => {
    setError(null);
    setSubmitting(true);
    let passwordBuffer: Buffer | null = null;
    try {
      passwordBuffer = Buffer.from(password, 'utf8');
      await unlockWithPassword(passwordBuffer);
    } catch (e) {
      setError(e instanceof DecryptionError ? 'Incorrect master password' : 'Could not unlock vault');
    } finally {
      passwordBuffer?.fill(0);
      setSubmitting(false);
      setPassword('');
    }
  };

  const handleBiometricUnlock = async (): Promise<void> => {
    setError(null);
    setSubmitting(true);
    try {
      const succeeded = await unlockWithBiometrics();
      if (!succeeded) setError('Biometric unlock was cancelled or failed. Use your master password instead.');
    } catch (e) {
      if (e instanceof BiometricKeyInvalidatedError) {
        // The enrolled key is permanently dead (most likely a new
        // biometric enrollment on the device since it was set up) — not
        // a retry-eligible prompt failure. nativeBiometricKeySource.unlock()
        // already removed the stale Keychain entry itself; this is the
        // other half only a screen with vault-header access can do:
        // stop offering a button that can now never work. Uses
        // updateSettingsWithoutUnlock() rather than session.vault, since
        // the vault is still locked here — biometric unlock just failed.
        await VaultStore.updateSettingsWithoutUnlock({ biometricUnlockEnabled: false }).catch(() => {});
        setShowBiometricButton(false);
        setError('Your biometric enrollment changed, so biometric unlock was turned off. Use your master password instead.');
      } else {
        setError('Biometric unlock failed. Use your master password instead.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen scroll>
      <Text style={[styles.title, { color: theme.colors.textPrimary, fontSize: theme.typography.title.fontSize }]}>
        Unlock Flintlock
      </Text>

      <TextField
        label="Master password"
        testID="password-input"
        isPassword
        value={password}
        onChangeText={setPassword}
        onSubmitEditing={handleUnlock}
      />

      {error && (
        <Text testID="form-error" style={{ color: theme.colors.danger, marginBottom: theme.spacing.md }}>
          {error}
        </Text>
      )}

      <Button label="Unlock" onPress={handleUnlock} loading={submitting} testID="unlock-button" />

      {showBiometricButton && (
        <Button
          label="Unlock with biometrics"
          onPress={handleBiometricUnlock}
          variant="secondary"
          disabled={submitting}
          testID="biometric-unlock-button"
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontWeight: '700', marginBottom: 24 },
});
