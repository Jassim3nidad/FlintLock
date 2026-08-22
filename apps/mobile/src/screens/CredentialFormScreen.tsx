import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp, NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen } from '../components/Screen';
import { TextField } from '../components/TextField';
import { Button } from '../components/Button';
import { TagPicker } from '../components/TagPicker';
import { useTheme } from '../theme/ThemeProvider';
import { useVaultSession } from '../state/VaultSessionProvider';
import { createCredential, CustomField, CustomFieldType, generatePassword, getCredential, updateCredential } from '@flintlock/core';
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
  const isEditing = credentialId !== undefined;

  const [loaded, setLoaded] = useState(!isEditing);
  const [existingId, setExistingId] = useState<string | undefined>(undefined);
  const [title, setTitle] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [url, setUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [favorite, setFavorite] = useState(false);
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isEditing || !credentialId) {
      setLoaded(true);
      return;
    }
    let cancelled = false;
    (async () => {
      const cred = await getCredential(session, credentialId);
      if (cancelled) return;
      if (cred) {
        setExistingId(cred.id);
        setTitle(cred.title);
        setUsername(cred.username);
        setPassword(cred.password);
        setUrl(cred.urls[0] ?? '');
        setNotes(cred.notes);
        setFavorite(cred.favorite);
        setTagIds(cred.tagIds);
        setCustomFields(cred.customFields);
      }
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [session, credentialId, isEditing]);

  const addCustomField = (): void => {
    setCustomFields((fields) => [...fields, { key: '', value: '', type: 'text' }]);
  };
  const updateCustomField = (index: number, patch: Partial<CustomField>): void => {
    setCustomFields((fields) => fields.map((f, i) => (i === index ? { ...f, ...patch } : f)));
  };
  const removeCustomField = (index: number): void => {
    setCustomFields((fields) => fields.filter((_, i) => i !== index));
  };
  const moveCustomField = (index: number, direction: -1 | 1): void => {
    setCustomFields((fields) => {
      const target = index + direction;
      if (target < 0 || target >= fields.length) return fields;
      const next = [...fields];
      [next[index], next[target]] = [next[target]!, next[index]!];
      return next;
    });
  };

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
        tagIds,
        customFields: customFields.filter((f) => f.key.trim().length > 0),
      };
      if (existingId) {
        await updateCredential(session, existingId, fields);
      } else {
        await createCredential(session, fields);
      }
      navigation.goBack();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save credential');
    } finally {
      setSaving(false);
    }
  };

  if (!loaded) return null;

  return (
    <Screen scroll>
      <Text style={[styles.title, { color: theme.colors.textPrimary, fontSize: theme.typography.title.fontSize }]}>
        {existingId ? 'Edit credential' : 'New credential'}
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

      <TagPicker selectedTagIds={tagIds} onChange={setTagIds} />

      <Text style={[styles.sectionLabel, { color: theme.colors.textSecondary }]}>Custom fields</Text>
      {customFields.map((field, index) => (
        <View key={index} testID={`custom-field-${index}`} style={[styles.customFieldRow, { borderColor: theme.colors.divider }]}>
          <TextField
            label="Field name"
            testID={`custom-field-key-${index}`}
            value={field.key}
            onChangeText={(v) => updateCustomField(index, { key: v })}
          />
          <TextField
            label="Value"
            testID={`custom-field-value-${index}`}
            isPassword={field.type === 'hidden'}
            value={field.value}
            onChangeText={(v) => updateCustomField(index, { value: v })}
          />
          <View style={styles.customFieldTypeRow}>
            {(['text', 'hidden', 'url', 'number', 'date'] as CustomFieldType[]).map((type) => {
              const isSelected = field.type === type;
              return (
                <Pressable
                  key={type}
                  testID={`custom-field-type-${index}-${type}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                  onPress={() => updateCustomField(index, { type })}
                  style={[
                    styles.typeChip,
                    { backgroundColor: isSelected ? theme.colors.primary : theme.colors.surface, borderRadius: theme.radius.pill },
                  ]}
                >
                  <Text style={[styles.typeChipLabel, { color: isSelected ? theme.colors.onPrimary : theme.colors.textPrimary }]}>
                    {type}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <View style={styles.customFieldActions}>
            <Pressable testID={`custom-field-up-${index}`} accessibilityRole="button" onPress={() => moveCustomField(index, -1)} hitSlop={8}>
              <Text style={{ color: theme.colors.primary }}>Up</Text>
            </Pressable>
            <Pressable testID={`custom-field-down-${index}`} accessibilityRole="button" onPress={() => moveCustomField(index, 1)} hitSlop={8}>
              <Text style={{ color: theme.colors.primary }}>Down</Text>
            </Pressable>
            <Pressable testID={`custom-field-remove-${index}`} accessibilityRole="button" onPress={() => removeCustomField(index)} hitSlop={8}>
              <Text style={{ color: theme.colors.danger }}>Remove</Text>
            </Pressable>
          </View>
        </View>
      ))}
      <Button label="Add custom field" onPress={addCustomField} variant="secondary" testID="add-custom-field-button" />

      <View style={styles.spacer} />
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
  sectionLabel: { fontSize: 13, fontWeight: '600', marginBottom: 8, marginTop: 8 },
  customFieldRow: { borderWidth: 1, borderRadius: 8, padding: 12, marginBottom: 12 },
  customFieldTypeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  typeChip: { paddingVertical: 4, paddingHorizontal: 10 },
  typeChipLabel: { fontSize: 12 },
  customFieldActions: { flexDirection: 'row', gap: 16 },
  error: { marginBottom: 16 },
});
