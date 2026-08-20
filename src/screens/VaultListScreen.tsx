import React, { useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Screen } from '../components/Screen';
import { useTheme } from '../theme/ThemeProvider';
import { useVaultSession } from '../state/VaultSessionProvider';
import { RecordCache } from '../vault/recordCache';
import { searchCredentials } from '../vault/search';
import { Credential } from '../storage/schema';
import type { MainStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<MainStackParamList, 'VaultList'>;

export function VaultListScreen() {
  const theme = useTheme();
  const navigation = useNavigation<Nav>();
  const { session } = useVaultSession();
  const cacheRef = useRef<RecordCache>(undefined);
  if (!cacheRef.current) cacheRef.current = new RecordCache(session);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Credential[]>([]);

  const refresh = useMemo(
    () => (q: string) => {
      setResults(searchCredentials(session, cacheRef.current!, q));
    },
    [session]
  );

  useFocusEffect(
    React.useCallback(() => {
      refresh(query);
      // Intentionally not depending on `query` here — refetch on focus
      // should reflect whatever's currently typed, not reset it.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [refresh])
  );

  const handleQueryChange = (text: string): void => {
    setQuery(text);
    refresh(text);
  };

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.colors.textPrimary, fontSize: theme.typography.title.fontSize }]}>
          Flintlock
        </Text>
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
  title: { fontWeight: '700' },
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
