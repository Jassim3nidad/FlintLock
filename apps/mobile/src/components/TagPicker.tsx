import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { useVaultSession } from '../state/VaultSessionProvider';
import { createTag, listTags, Tag } from '@flintlock/core';
import { randomTagColor } from './tagPalette';

interface TagPickerProps {
  selectedTagIds: string[];
  onChange: (tagIds: string[]) => void;
}

export function TagPicker({ selectedTagIds, onChange }: TagPickerProps) {
  const theme = useTheme();
  const { session } = useVaultSession();
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [query, setQuery] = useState('');

  useEffect(() => {
    let cancelled = false;
    listTags(session).then((tags) => {
      if (!cancelled) setAllTags(tags);
    });
    return () => {
      cancelled = true;
    };
  }, [session]);

  const selectedTags = selectedTagIds.map((id) => allTags.find((t) => t.id === id)).filter((t): t is Tag => t !== undefined);
  const trimmedQuery = query.trim();
  const suggestions = trimmedQuery
    ? allTags.filter((t) => !selectedTagIds.includes(t.id) && t.name.toLowerCase().includes(trimmedQuery.toLowerCase()))
    : [];
  const exactMatchExists = allTags.some((t) => t.name.toLowerCase() === trimmedQuery.toLowerCase());

  const handleRemove = (tagId: string): void => {
    onChange(selectedTagIds.filter((id) => id !== tagId));
  };

  const handleAddExisting = (tag: Tag): void => {
    onChange([...selectedTagIds, tag.id]);
    setQuery('');
  };

  const handleCreateNew = (): void => {
    if (!trimmedQuery) return;
    createTag(session, trimmedQuery, randomTagColor())
      .then((tag) => {
        setAllTags((prev) => [...prev, tag]);
        onChange([...selectedTagIds, tag.id]);
        setQuery('');
      })
      .catch(() => {});
  };

  return (
    <View style={styles.container}>
      <Text style={[styles.label, { color: theme.colors.textSecondary }]}>Tags</Text>

      <View style={styles.chipRow}>
        {selectedTags.map((tag) => (
          <View key={tag.id} testID={`selected-tag-${tag.id}`} style={[styles.chip, { backgroundColor: tag.color }]}>
            <Text style={styles.chipLabel}>{tag.name}</Text>
            <Pressable
              testID={`remove-tag-${tag.id}`}
              accessibilityRole="button"
              accessibilityLabel={`Remove tag ${tag.name}`}
              onPress={() => handleRemove(tag.id)}
              hitSlop={8}
            >
              <Text style={styles.chipRemove}>×</Text>
            </Pressable>
          </View>
        ))}
      </View>

      <TextInput
        testID="tag-input"
        accessibilityLabel="Add a tag"
        placeholder="Add a tag"
        placeholderTextColor={theme.colors.textMuted}
        value={query}
        onChangeText={setQuery}
        onSubmitEditing={exactMatchExists ? undefined : handleCreateNew}
        style={[
          styles.input,
          { color: theme.colors.textPrimary, borderColor: theme.colors.inputBorder, borderRadius: theme.radius.md },
        ]}
      />

      {suggestions.length > 0 && (
        <View style={styles.suggestions}>
          {suggestions.map((tag) => (
            <Pressable
              key={tag.id}
              testID={`suggestion-${tag.id}`}
              accessibilityRole="button"
              onPress={() => handleAddExisting(tag)}
              style={[styles.suggestionChip, { backgroundColor: tag.color }]}
            >
              <Text style={styles.chipLabel}>{tag.name}</Text>
            </Pressable>
          ))}
        </View>
      )}

      {trimmedQuery.length > 0 && !exactMatchExists && (
        <Pressable testID="create-tag-button" accessibilityRole="button" onPress={handleCreateNew} style={styles.createRow}>
          <Text style={{ color: theme.colors.primary }}>Create tag "{trimmedQuery}"</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: 16 },
  label: { fontSize: 13, marginBottom: 6, fontWeight: '500' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', borderRadius: 999, paddingVertical: 4, paddingHorizontal: 10, gap: 6 },
  chipLabel: { color: '#FFFFFF', fontWeight: '600', fontSize: 13 },
  chipRemove: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
  input: { borderWidth: 1, paddingVertical: 8, paddingHorizontal: 12, fontSize: 14 },
  suggestions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  suggestionChip: { borderRadius: 999, paddingVertical: 4, paddingHorizontal: 10 },
  createRow: { marginTop: 8 },
});
