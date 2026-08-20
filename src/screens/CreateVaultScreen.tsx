import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Screen } from '../components/Screen';
import { TextField } from '../components/TextField';
import { Button } from '../components/Button';
import { useTheme } from '../theme/ThemeProvider';
import { useVaultSession } from '../state/VaultSessionProvider';
import { Buffer } from '../crypto';
import { estimatePasswordEntropyBits } from '../vault/securityDashboard';

const MIN_LENGTH = 8;

export function CreateVaultScreen() {
  const theme = useTheme();
  const { createVault } = useVaultSession();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const entropyBits = estimatePasswordEntropyBits(password);

  const handleCreate = async (): Promise<void> => {
    if (password.length < MIN_LENGTH) {
      setError(`Master password must be at least ${MIN_LENGTH} characters`);
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      const passwordBuffer = Buffer.from(password, 'utf8');
      await createVault(passwordBuffer);
      passwordBuffer.fill(0);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create vault');
    } finally {
      setSubmitting(false);
      setPassword('');
      setConfirm('');
    }
  };

  return (
    <Screen scroll>
      <Text style={[styles.title, { color: theme.colors.textPrimary, fontSize: theme.typography.title.fontSize }]}>
        Create your vault
      </Text>
      <Text style={[styles.intro, { color: theme.colors.textSecondary }]}>
        Your master password encrypts everything in this vault. Flintlock does not store it, transmit it, or have any
        way to recover it.
      </Text>

      <View
        testID="no-recovery-warning"
        style={[
          styles.warningBox,
          {
            backgroundColor: theme.colors.surface,
            borderRadius: theme.radius.md,
            borderColor: theme.colors.warning,
          },
        ]}
      >
        <Text style={[styles.warningTitle, { color: theme.colors.warning }]}>There is no password recovery.</Text>
        <Text style={{ color: theme.colors.textSecondary }}>
          If you forget this password, your vault — every credential in it — is permanently unrecoverable. There is
          no reset link, no support ticket, no backdoor.
        </Text>
      </View>

      <TextField label="Master password" testID="password-input" isPassword value={password} onChangeText={setPassword} />
      {password.length > 0 && (
        <Text testID="entropy-display" style={[styles.entropy, { color: theme.colors.textMuted }]}>
          Estimated strength: {Math.round(entropyBits)} bits
        </Text>
      )}
      <TextField label="Confirm master password" testID="confirm-input" isPassword value={confirm} onChangeText={setConfirm} />

      {error && (
        <Text testID="form-error" style={[styles.error, { color: theme.colors.danger }]}>
          {error}
        </Text>
      )}

      <Button label="Create vault" onPress={handleCreate} loading={submitting} testID="create-vault-button" />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontWeight: '700', marginBottom: 8 },
  intro: { marginBottom: 24 },
  warningBox: { padding: 16, marginBottom: 24, borderWidth: 1 },
  warningTitle: { fontWeight: '700', marginBottom: 4 },
  entropy: { marginTop: -8, marginBottom: 16 },
  error: { marginBottom: 16 },
});
