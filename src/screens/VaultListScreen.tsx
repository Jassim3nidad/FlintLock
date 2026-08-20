import React, { useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Screen } from '../components/Screen';
import { useTheme } from '../theme/ThemeProvider';
import { useVaultSession } from '../state/VaultSessionProvider';
import { RecordCache } from '../vault/recordCache';
import { searchCredentials } from '../vault/search';
import { listTags, TagFilterMode } from '../vault/tagService';
import { Credential, Tag } from '../storage/schema';
import type { MainStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<MainStackParamList, 'VaultList'>;

function applyTagFilter(credentials: Credential[], tagIds: string[], mode: TagFilterMode): Credential[] {
  if (tagIds.length === 0) return credentials;
  return credentials.filter((c) =>
    mode === 'AND' ? tagIds.every((id) => c.tagIds.includes(id)) : tagIds.some((id) => c.tagIds.includes(id))
  );
}

export function VaultListScreen() {
  const theme = useTheme();
  const navigation = useNavigation<Nav>();
  const { session } = useVaultSession();
  const cacheRef = useRef<RecordCache>(undefined);
  if (!cacheRef.current) cacheRef.current = new RecordCache(session);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Credential[]>([]);
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [tagMode, setTagMode] = useState<TagFilterMode>('AND');

  const refresh = useMemo(
    () => (q: string, tagIds: string[], mode: TagFilterMode) => {
      setResults(applyTagFilter(searchCredentials(session, cacheRef.current!, q), tagIds, mode));
    },
    [session]
  );

  useFocusEffect(
    React.useCallback(() => {
      setAllTags(listTags(session));
      refresh(query, selectedTagIds, tagMode);
      // Intentionally not depending on `query`/`selectedTagIds`/`tagMode`
      // here — refetch on focus should reflect whatever's currently
      // selected, not reset it.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [refresh])
  );

  const handleQueryChange = (text: string): void => {
    setQuery(text);
    refresh(text, selectedTagIds, tagMode);
  };

  const toggleTag = (tagId: string): void => {
    const next = selectedTagIds.includes(tagId)
      ? selectedTagIds.filter((id) => id !== tagId)
      : [...selectedTagIds, tagId];
    setSelectedTagIds(next);
    refresh(query, next, tagMode);
  };

  const toggleTagMode = (): void => {
    const next: TagFilterMode = tagMode === 'AND' ? 'OR' : 'AND';
    setTagMode(next);
    refresh(query, selectedTagIds, next);
  };

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.colors.textPrimary, fontSize: theme.typography.title.fontSize }]}>
          Flintlock
        </Text>
        <View style={styles.headerActions}>
          <Pressable
            testID="manage-tags-button"
            accessibilityRole="button"
            accessibilityLabel="Manage tags"
            onPress={() => navigation.navigate('TagManagement')}
            hitSlop={8}
          >
            <Text style={[styles.settingsLabel, { color: theme.colors.primary }]}>Tags</Text>
          </Pressable>
          <Pressable
            testID="settings-button"
            accessibilityRole="button"
            accessibilityLabel="Settings"
            onPress={() => navigation.navigate('Settings')}
            hitSlop={8}
          >
            <Text style={[styles.settingsLabel, { color: theme.colors.primary }]}>Settings</Text>
          </Pressable>
        </View>
      </View>

      {allTags.length > 0 && (
        <View style={styles.tagFilterRow} testID="tag-filter-row">
          {allTags.map((tag) => {
            const isSelected = selectedTagIds.includes(tag.id);
            const chipLabelColor = isSelected ? '#FFFFFF' : theme.colors.textPrimary;
            return (
              <Pressable
                key={tag.id}
                testID={`tag-filter-${tag.id}`}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                onPress={() => toggleTag(tag.id)}
                style={[
                  styles.tagFilterChip,
                  { backgroundColor: isSelected ? tag.color : theme.colors.surface, borderRadius: theme.radius.pill },
                ]}
              >
                <Text style={[styles.tagFilterChipLabel, { color: chipLabelColor }]}>{tag.name}</Text>
              </Pressable>
            );
          })}
          {selectedTagIds.length > 1 && (
            <Pressable
              testID="tag-filter-mode"
              accessibilityRole="button"
              onPress={toggleTagMode}
              style={[styles.tagFilterChip, { backgroundColor: theme.colors.surface, borderRadius: theme.radius.pill }]}
            >
              <Text style={[styles.tagFilterChipLabel, { color: theme.colors.textSecondary }]}>{tagMode}</Text>
            </Pressable>
          )}
        </View>
      )}

      <TextInput
        testID="search-input"
        accessibilityLabel="Search credentials"
        placeholder="Search"
        placeholderTextColor={theme.colors.textMuted}
        value={query}
        onChangeText={handleQueryChange}
        autoCapitalize="none"
        autoCorrect={false}
        style={[
          styles.search,
          {
            color: theme.colors.textPrimary,
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.inputBorder,
            borderRadius: theme.radius.md,
          },
        ]}
      />

      <FlatList
        testID="credential-list"
        data={results}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={
          <Text testID="empty-state" style={{ color: theme.colors.textMuted, marginTop: theme.spacing.lg }}>
            {query ? 'No matches' : 'No credentials yet — tap Add to create one'}
          </Text>
        }
        renderItem={({ item }) => (
          <Pressable
            testID={`credential-row-${item.id}`}
            accessibilityRole="button"
            onPress={() => navigation.navigate('CredentialDetail', { credentialId: item.id })}
            style={[styles.row, { borderBottomColor: theme.colors.divider }]}
          >
            <Text style={[styles.rowTitle, { color: theme.colors.textPrimary }]}>{item.title}</Text>
            <Text style={{ color: theme.colors.textSecondary }}>{item.username}</Text>
          </Pressable>
        )}
      />

      <Pressable
        testID="add-credential-button"
        accessibilityRole="button"
        accessibilityLabel="Add credential"
        onPress={() => navigation.navigate('CredentialForm', {})}
        style={[styles.fab, { backgroundColor: theme.colors.primary, borderRadius: theme.radius.pill }]}
      >
        <Text style={[styles.fabIcon, { color: theme.colors.onPrimary }]}>+</Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  headerActions: { flexDirection: 'row', gap: 16 },
  title: { fontWeight: '700' },
  tagFilterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  tagFilterChip: { paddingVertical: 4, paddingHorizontal: 10 },
  tagFilterChipLabel: { fontSize: 13 },
  search: { borderWidth: 1, paddingVertical: 10, paddingHorizontal: 12, marginBottom: 16, fontSize: 16 },
  row: { paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  rowTitle: { fontWeight: '600', marginBottom: 2 },
  settingsLabel: { fontWeight: '600' },
  fabIcon: { fontSize: 28, lineHeight: 28 },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
