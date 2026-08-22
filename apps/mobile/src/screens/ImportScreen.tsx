import React, { useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Screen } from '../components/Screen';
import { Button } from '../components/Button';
import { TextField } from '../components/TextField';
import { OptionRow } from '../components/OptionRow';
import { useTheme } from '../theme/ThemeProvider';
import { useVaultSession } from '../state/VaultSessionProvider';
import {
  Buffer,
  commitFlbxImport,
  DecryptionError,
  FlbxFormatError,
  ImportMode,
  ImportPreview,
  previewFlbxImport,
} from '@flintlock/core';
import { fileSystem } from '../files/native';
import { PickedFile } from '../files/types';

const MODE_OPTIONS: ImportMode[] = ['merge', 'replace'];

export function ImportScreen() {
  const theme = useTheme();
  const navigation = useNavigation();
  const { session } = useVaultSession();

  const [pickedFile, setPickedFile] = useState<PickedFile | null>(null);
  const [password, setPassword] = useState('');
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [mode, setMode] = useState<ImportMode>('merge');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imported, setImported] = useState(false);

  const handlePickFile = async (): Promise<void> => {
    setError(null);
    try {
      const file = await fileSystem.pickFile();
      if (file) {
        setPickedFile(file);
        setPreview(null);
        setImported(false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not pick a file');
    }
  };

  const handlePreview = async (): Promise<void> => {
    if (!pickedFile) return;
    setError(null);
    setBusy(true);
    let passwordBuffer: Buffer | null = null;
    try {
      passwordBuffer = Buffer.from(password, 'utf8');
      const result = await previewFlbxImport(session, passwordBuffer, pickedFile.content);
      setPreview(result);
    } catch (e) {
      if (e instanceof DecryptionError) setError('Incorrect master password');
      else if (e instanceof FlbxFormatError) setError(e.message);
      else setError('Could not read this file');
    } finally {
      passwordBuffer?.fill(0);
      setBusy(false);
      setPassword('');
    }
  };

  const handleImport = (): void => {
    if (!preview) return;
    commitFlbxImport(session, preview, mode)
      .then(() => {
        setImported(true);
        setPreview(null);
        setPickedFile(null);
      })
      .catch(() => {
        setError('Import failed');
      });
  };

  return (
    <Screen scroll>
      <Text style={[styles.title, { color: theme.colors.textPrimary, fontSize: theme.typography.title.fontSize }]}>
        Import vault
      </Text>
      <Text style={[styles.intro, { color: theme.colors.textSecondary }]}>
        Only Flintlock's own .flbx backup format can be imported.
      </Text>

      <Button
        label="Pick file"
        onPress={() => {
          handlePickFile().catch(() => {});
        }}
        variant="secondary"
        testID="pick-file-button"
      />
      {pickedFile && (
        <Text testID="picked-file-name" style={[styles.pickedFile, { color: theme.colors.textPrimary }]}>
          {pickedFile.name}
        </Text>
      )}

      {pickedFile && !preview && !imported && (
        <>
          <View style={styles.spacer} />
          <TextField label="Master password" testID="import-password" isPassword value={password} onChangeText={setPassword} />
          <Button
            label="Preview"
            onPress={() => {
              handlePreview().catch(() => {});
            }}
            loading={busy}
            testID="preview-button"
          />
        </>
      )}

      {error && (
        <Text testID="import-error" style={[styles.errorText, { color: theme.colors.danger }]}>
          {error}
        </Text>
      )}

      {preview && (
        <View style={styles.previewSection}>
          <Text style={[styles.sectionLabel, { color: theme.colors.textSecondary }]}>
            {preview.entries.length} record{preview.entries.length === 1 ? '' : 's'} found
          </Text>
          <FlatList
            testID="import-preview-list"
            data={preview.entries}
            keyExtractor={(entry) => entry.id}
            scrollEnabled={false}
            renderItem={({ item }) => (
              <View testID={`import-preview-entry-${item.id}`} style={[styles.previewRow, { borderBottomColor: theme.colors.divider }]}>
                <Text style={{ color: theme.colors.textPrimary }}>{item.recordType}</Text>
                <Text style={{ color: theme.colors.textSecondary }}>{item.action}</Text>
              </View>
            )}
          />

          <Text style={[styles.sectionLabel, { color: theme.colors.textSecondary }]}>Mode</Text>
          <OptionRow options={MODE_OPTIONS} selected={mode} onSelect={setMode} />

          <Button label="Import" onPress={handleImport} testID="import-button" />
        </View>
      )}

      {imported && (
        <Text testID="import-success" style={[styles.successText, { color: theme.colors.textSecondary }]}>
          Import complete.
        </Text>
      )}

      <View style={styles.spacer} />
      <Button label="Back" onPress={() => navigation.goBack()} variant="secondary" testID="back-button" />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontWeight: '700', marginBottom: 8 },
  intro: { marginBottom: 24 },
  pickedFile: { marginTop: 12, marginBottom: 12 },
  sectionLabel: { fontSize: 13, fontWeight: '600', marginBottom: 8, marginTop: 8 },
  errorText: { marginTop: 12, marginBottom: 12 },
  successText: { marginBottom: 16 },
  previewSection: { marginTop: 16 },
  previewRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  spacer: { height: 12 },
});
