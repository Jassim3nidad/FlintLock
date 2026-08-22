import React, { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Screen } from '../components/Screen';
import { TextField } from '../components/TextField';
import { Button } from '../components/Button';
import { TAG_PALETTE } from '../components/tagPalette';
import { useTheme } from '../theme/ThemeProvider';
import { useVaultSession } from '../state/VaultSessionProvider';
import { deleteTag, listTags, renameTag, Tag, updateTagColor } from '@flintlock/core';

export function TagManagementScreen() {
  const theme = useTheme();
  const navigation = useNavigation();
  const { session } = useVaultSession();
  const [tags, setTags] = useState<Tag[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState('');

  const refresh = useCallback(async () => setTags(await listTags(session)), [session]);

  useFocusEffect(
    useCallback(() => {
      refresh().catch(() => {});
    }, [refresh])
  );

  const startEdit = (tag: Tag): void => {
    setEditingId(tag.id);
    setNameDraft(tag.name);
  };

  const commitRename = (tag: Tag): void => {
    const trimmed = nameDraft.trim();
    setEditingId(null);
    if (trimmed && trimmed !== tag.name) {
      renameTag(session, tag.id, trimmed)
        .then(refresh)
        .catch(() => {});
    }
  };

  const handleColor = (tag: Tag, color: string): void => {
    updateTagColor(session, tag.id, color)
      .then(refresh)
      .catch(() => {});
  };

  const handleDelete = (tag: Tag): void => {
    Alert.alert('Delete tag?', `"${tag.name}" will be removed from every credential. This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          deleteTag(session, tag.id)
            .then(refresh)
            .catch(() => {});
        },
      },
    ]);
  };

  return (
    <Screen>
      <Text style={[styles.title, { color: theme.colors.textPrimary, fontSize: theme.typography.title.fontSize }]}>
        Manage tags
      </Text>

      <FlatList
        testID="tag-list"
        data={tags}
        keyExtractor={(item) => item.id}
        style={styles.list}
        ListEmptyComponent={
          <Text testID="empty-tags" style={{ color: theme.colors.textMuted }}>
            No tags yet
          </Text>
        }
        renderItem={({ item }) => (
          <View testID={`tag-row-${item.id}`} style={[styles.row, { borderBottomColor: theme.colors.divider }]}>
            <View style={styles.nameRow}>
              <View style={[styles.swatch, { backgroundColor: item.color, borderRadius: theme.radius.pill }]} />
              {editingId === item.id ? (
                <View style={styles.editRow}>
                  <TextField
                    label="Tag name"
                    testID={`tag-name-input-${item.id}`}
                    value={nameDraft}
                    onChangeText={setNameDraft}
                    onSubmitEditing={() => commitRename(item)}
                  />
                  <Pressable
                    testID={`tag-save-${item.id}`}
                    accessibilityRole="button"
                    onPress={() => commitRename(item)}
                    hitSlop={8}
                  >
                    <Text style={{ color: theme.colors.primary }}>Save</Text>
                  </Pressable>
                </View>
              ) : (
                <Pressable
                  testID={`tag-name-${item.id}`}
                  accessibilityRole="button"
                  onPress={() => startEdit(item)}
                  style={styles.nameLabel}
                >
                  <Text style={{ color: theme.colors.textPrimary }}>{item.name}</Text>
                </Pressable>
              )}
            </View>

            <View style={styles.colorRow}>
              {TAG_PALETTE.map((color) => {
                const swatchBorderWidth = item.color === color ? 2 : 0;
                return (
                  <Pressable
                    key={color}
                    testID={`tag-color-${item.id}-${color}`}
                    accessibilityRole="button"
                    accessibilityLabel={`Set color ${color}`}
                    onPress={() => handleColor(item, color)}
                    style={[
                      styles.colorSwatch,
                      {
                        backgroundColor: color,
                        borderRadius: theme.radius.pill,
                        borderWidth: swatchBorderWidth,
                        borderColor: theme.colors.textPrimary,
                      },
                    ]}
                  />
                );
              })}
            </View>

            <Pressable
              testID={`tag-delete-${item.id}`}
              accessibilityRole="button"
              accessibilityLabel={`Delete tag ${item.name}`}
              onPress={() => handleDelete(item)}
              hitSlop={8}
            >
              <Text style={{ color: theme.colors.danger }}>Delete</Text>
            </Pressable>
          </View>
        )}
      />

      <Button label="Back" onPress={() => navigation.goBack()} variant="secondary" testID="back-button" />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontWeight: '700', marginBottom: 24 },
  list: { flexGrow: 0, marginBottom: 16 },
  row: { paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  nameLabel: { flexShrink: 1 },
  editRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  swatch: { width: 14, height: 14 },
  colorRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  colorSwatch: { width: 22, height: 22 },
});
