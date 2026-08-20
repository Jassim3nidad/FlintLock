import React, { useState } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp, NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen } from '../components/Screen';
import { TextField } from '../components/TextField';
import { Button } from '../components/Button';
import { useTheme } from '../theme/ThemeProvider';
import { useVaultSession } from '../state/VaultSessionProvider';
import { createCredential, getCredential, updateCredential } from '../vault/credentialService';
import { generatePassword } from '../generator/passwordGenerator';
import type { MainStackParamList } from '../navigation/types';

type Route = NativeStackScreenProps<MainStackParamList, 'CredentialForm'>['route'];
type Nav = NativeStackNavigationProp<MainStackParamList>;

const GENERATOR_DEFAULTS = { length: 20, uppercase: true, lowercase: true, digits: true, symbols: true, excludeAmbiguous: false };

export function CredentialFormScreen() {
  const theme = useTheme();
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { session } = useVaultSession();
  const credentialId = route.params?.credentialId;
  const existing = credentialId ? getCredential(session, credentialId) : undefined;

  const [title, setTitle] = useState(existing?.title ?? '');
  const [username, setUsername] = useState(existing?.username ?? '');
  const [password, setPassword] = useState(existing?.password ?? '');
  const [url, setUrl] = useState(existing?.urls[0] ?? '');
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [favorite, setFavorite] = useState(existing?.favorite ?? false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleGenerate = (): void => {
    setPassword(generatePassword(GENERATOR_DEFAULTS).value);
  };

  const handleSave = async (): Promise<void> => {
    if (!title.trim()) {
      setError('Title is required');
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const fields = {
        title: title.trim(),
        username,
        password,
        urls: url ? [url] : [],
        notes,
        favorite,
      };
      if (existing) {
        updateCredential(session, existing.id, fields);
      } else {
        createCredential(session, { ...fields, tagIds: [], customFields: [] });
      }
      navigation.goBack();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save credential');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen scroll>
      <Text style={[styles.title, { color: theme.colors.textPrimary, fontSize: theme.typography.title.fontSize }]}>
        {existing ? 'Edit credential' : 'New credential'}
      </Text>

      <TextField label="Title" testID="title-input" value={title} onChangeText={setTitle} />
      <TextField label="Username" testID="username-input" value={username} onChangeText={setUsername} />

      <TextField label="Password" testID="password-input" isPassword value={password} onChangeText={setPassword} />
      <Button label="Generate password" onPress={handleGenerate} variant="secondary" testID="generate-password-button" />

      <View style={styles.spacer} />
      <TextField label="URL" testID="url-input" value={url} onChangeText={setUrl} autoCapitalize="none" keyboardType="url" />
      <TextField label="Notes" testID="notes-input" value={notes} onChangeText={setNotes} multiline />

      <View style={styles.favoriteRow}>
        <Text style={{ color: theme.colors.textPrimary }}>Favorite</Text>
        <Switch testID="favorite-switch" value={favorite} onValueChange={setFavorite} />
      </View>

      {error && (
        <Text testID="form-error" style={[styles.error, { color: theme.colors.danger }]}>
          {error}
        </Text>
      )}

      <Button label="Save" onPress={handleSave} loading={saving} testID="save-button" />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontWeight: '700', marginBottom: 24 },
  spacer: { height: 8 },
  favoriteRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  error: { marginBottom: 16 },
});
