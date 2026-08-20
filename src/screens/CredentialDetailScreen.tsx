import React, { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp, NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen } from '../components/Screen';
import { Button } from '../components/Button';
import { useTheme } from '../theme/ThemeProvider';
import { useVaultSession } from '../state/VaultSessionProvider';
import { getCredential, hardDeleteCredential, softDeleteCredential } from '../vault/credentialService';
import { ClipboardManager } from '../clipboard/clipboardManager';
import type { MainStackParamList } from '../navigation/types';

type Route = NativeStackScreenProps<MainStackParamList, 'CredentialDetail'>['route'];
type Nav = NativeStackNavigationProp<MainStackParamList>;

function Field({ label, value, onCopy }: { label: string; value: string; onCopy?: () => void }) {
  const theme = useTheme();
  if (!value) return null;
  return (
    <View style={styles.field}>
      <Text style={[styles.fieldLabel, { color: theme.colors.textSecondary }]}>{label}</Text>
      <View style={styles.fieldRow}>
        <Text style={[styles.fieldValue, { color: theme.colors.textPrimary }]}>{value}</Text>
        {onCopy && (
          <Pressable accessibilityRole="button" accessibilityLabel={`Copy ${label}`} onPress={onCopy} hitSlop={8}>
            <Text style={[styles.copyLabel, { color: theme.colors.primary }]}>Copy</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

export function CredentialDetailScreen() {
  const theme = useTheme();
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { session } = useVaultSession();
  const credential = getCredential(session, route.params.credentialId);

  const clipboardRef = useRef<ClipboardManager>(undefined);
  if (!clipboardRef.current) clipboardRef.current = new ClipboardManager();
  const [copyCountdown, setCopyCountdown] = useState<number | null>(null);

  useEffect(() => {
    const unsubscribeTick = clipboardRef.current!.onTick((seconds) => setCopyCountdown(seconds > 0 ? seconds : null));
    const unsubscribeLock = session.onLock(() => {
      clipboardRef.current!.clear().catch(() => {});
    });
    return () => {
      unsubscribeTick();
      unsubscribeLock();
    };
  }, [session]);

  if (!credential) {
    return (
      <Screen>
        <Text testID="missing-credential-message" style={{ color: theme.colors.textSecondary }}>
          This credential no longer exists.
        </Text>
      </Screen>
    );
  }

  const handleCopy = (value: string) => (): void => {
    clipboardRef.current!.copy(value).catch(() => {});
  };

  const handleDelete = (): void => {
    Alert.alert('Delete permanently?', `"${credential.title}" will be permanently deleted. This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          hardDeleteCredential(session, credential.id);
          navigation.goBack();
        },
      },
    ]);
  };

  const handleMoveToTrash = (): void => {
    softDeleteCredential(session, credential.id);
    navigation.goBack();
  };

  return (
    <Screen scroll>
      <Text testID="credential-title" style={[styles.title, { color: theme.colors.textPrimary, fontSize: theme.typography.title.fontSize }]}>
        {credential.title}
      </Text>

      <Field label="Username" value={credential.username} onCopy={handleCopy(credential.username)} />
      <Field label="Password" value={credential.password} onCopy={handleCopy(credential.password)} />
      {copyCountdown !== null && (
        <Text testID="copy-countdown" style={[styles.countdown, { color: theme.colors.textMuted }]}>
          Clipboard clears in {copyCountdown}s
        </Text>
      )}
      <Field label="URL" value={credential.urls[0] ?? ''} />
      <Field label="Notes" value={credential.notes} />

      <View style={styles.actions}>
        <Button label="Edit" onPress={() => navigation.navigate('CredentialForm', { credentialId: credential.id })} testID="edit-button" />
        <Button label="Move to trash" onPress={handleMoveToTrash} variant="secondary" testID="trash-button" />
        <Button label="Delete permanently" onPress={handleDelete} variant="danger" testID="delete-button" />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontWeight: '700', marginBottom: 24 },
  copyLabel: { fontWeight: '600' },
  field: { marginBottom: 16 },
  fieldLabel: { fontSize: 13, marginBottom: 2 },
  fieldRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  fieldValue: { fontSize: 16, flexShrink: 1 },
  countdown: { marginTop: -12, marginBottom: 16, fontSize: 12 },
  actions: { marginTop: 16, gap: 12 },
});
