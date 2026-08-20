import React, { useState } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Screen } from '../components/Screen';
import { Button } from '../components/Button';
import { TextField } from '../components/TextField';
import { OptionRow } from '../components/OptionRow';
import { useTheme } from '../theme/ThemeProvider';
import { useVaultSession } from '../state/VaultSessionProvider';
import { VaultStore } from '../storage/vaultStore';
import { Buffer, DecryptionError } from '../crypto';
import { exportFlbx } from '../export/flbxService';
import { exportCsv } from '../export/csvExport';
import { exportKeePassXml } from '../export/keepassXmlExport';
import { fileSystem } from '../files/native';

type ExportFormat = 'flbx' | 'csv' | 'keepass';
const FORMAT_OPTIONS: ExportFormat[] = ['flbx', 'csv', 'keepass'];
const PLAINTEXT_FORMATS: ExportFormat[] = ['csv', 'keepass'];

export function ExportScreen() {
  const theme = useTheme();
  const navigation = useNavigation();
  const { session } = useVaultSession();

  const [format, setFormat] = useState<ExportFormat>('flbx');
  const [password, setPassword] = useState('');
  const [acknowledgedRisk, setAcknowledgedRisk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const isPlaintextFormat = PLAINTEXT_FORMATS.includes(format);
  const canExport = password.length > 0 && (!isPlaintextFormat || acknowledgedRisk);

  const handleFormatChange = (next: ExportFormat): void => {
    setFormat(next);
    setAcknowledgedRisk(false);
    setSuccess(false);
    setError(null);
  };

  const handleExport = async (): Promise<void> => {
    setError(null);
    setSuccess(false);
    setBusy(true);
    let passwordBuffer: Buffer | null = null;
    try {
      passwordBuffer = Buffer.from(password, 'utf8');
      const dek = await VaultStore.verifyPasswordAndGetDek(passwordBuffer);
      dek.fill(0);

      if (format === 'flbx') {
        const fileBuffer = await exportFlbx(session, passwordBuffer);
        await fileSystem.shareText(fileBuffer.toString('base64'), 'Flintlock backup (.flbx, base64-encoded)');
      } else if (format === 'csv') {
        const csv = exportCsv(session, { acknowledgeRisk: true });
        await fileSystem.shareText(csv, 'Flintlock export (CSV)');
      } else {
        const xml = exportKeePassXml(session, { acknowledgeRisk: true });
        await fileSystem.shareText(xml, 'Flintlock export (KeePass XML)');
      }
      setSuccess(true);
    } catch (e) {
      setError(e instanceof DecryptionError ? 'Incorrect master password' : 'Export failed');
    } finally {
      passwordBuffer?.fill(0);
      setBusy(false);
      setPassword('');
    }
  };

  return (
    <Screen scroll>
      <Text style={[styles.title, { color: theme.colors.textPrimary, fontSize: theme.typography.title.fontSize }]}>
        Export vault
      </Text>

      <Text style={[styles.sectionLabel, { color: theme.colors.textSecondary }]}>Format</Text>
      <OptionRow options={FORMAT_OPTIONS} selected={format} onSelect={handleFormatChange} />

      {isPlaintextFormat && (
        <View testID="plaintext-warning" style={[styles.warningPanel, { backgroundColor: theme.colors.surface, borderRadius: theme.radius.md }]}>
          <Text style={[styles.warningText, { color: theme.colors.danger }]}>
            This file will contain every password in plain text, readable by anything with access to it. Anyone who gets this
            file can read your passwords.
          </Text>
          <View style={styles.row}>
            <Text style={{ color: theme.colors.textPrimary }}>I understand the risk</Text>
            <Switch testID="acknowledge-risk-switch" value={acknowledgedRisk} onValueChange={setAcknowledgedRisk} />
          </View>
        </View>
      )}

      <TextField label="Master password" testID="export-password" isPassword value={password} onChangeText={setPassword} />

      {error && (
        <Text testID="export-error" style={[styles.errorText, { color: theme.colors.danger }]}>
          {error}
        </Text>
      )}
      {success && (
        <Text testID="export-success" style={[styles.successText, { color: theme.colors.textSecondary }]}>
          Export ready — choose where to save it from the share sheet.
        </Text>
      )}

      <Button
        label="Export"
        onPress={() => {
          handleExport().catch(() => {});
        }}
        disabled={!canExport}
        loading={busy}
        testID="export-button"
      />
      <View style={styles.spacer} />
      <Button label="Back" onPress={() => navigation.goBack()} variant="secondary" testID="back-button" />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontWeight: '700', marginBottom: 24 },
  sectionLabel: { fontSize: 13, fontWeight: '600', marginBottom: 8 },
  warningPanel: { padding: 16, marginBottom: 16 },
  warningText: { marginBottom: 12 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  errorText: { marginBottom: 16 },
  successText: { marginBottom: 16 },
  spacer: { height: 12 },
});
