import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp, NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen } from '../components/Screen';
import { TextField } from '../components/TextField';
import { Button } from '../components/Button';
import { useTheme } from '../theme/ThemeProvider';
import { useVaultSession } from '../state/VaultSessionProvider';
import { createTotpEntryFromOtpauthUri, createTotpEntryManually } from '../vault/totpService';
import { OtpAlgorithm, OtpDigits } from '../totp/hotp';
import type { MainStackParamList } from '../navigation/types';

type Route = NativeStackScreenProps<MainStackParamList, 'AddTotp'>['route'];
type Nav = NativeStackNavigationProp<MainStackParamList>;

type EntryMode = 'manual' | 'uri';
const ALGORITHMS: OtpAlgorithm[] = ['SHA1', 'SHA256', 'SHA512'];
const DIGIT_OPTIONS: OtpDigits[] = [6, 8];

function Chips<T extends string | number>({ options, selected, onSelect }: { options: T[]; selected: T; onSelect: (v: T) => void }) {
  const theme = useTheme();
  return (
    <View style={styles.chipRow}>
      {options.map((option) => {
        const isSelected = option === selected;
        return (
          <Pressable
            key={String(option)}
            testID={`chip-${option}`}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected }}
            onPress={() => onSelect(option)}
            style={[
              styles.chip,
              { backgroundColor: isSelected ? theme.colors.primary : theme.colors.surface, borderRadius: theme.radius.pill },
            ]}
          >
            <Text style={{ color: isSelected ? theme.colors.onPrimary : theme.colors.textPrimary }}>{option}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function AddTotpScreen() {
  const theme = useTheme();
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { session } = useVaultSession();
  const credentialId = route.params?.credentialId ?? null;

  const [entryMode, setEntryMode] = useState<EntryMode>('manual');
  const [issuer, setIssuer] = useState('');
  const [account, setAccount] = useState('');
  const [secret, setSecret] = useState('');
  const [algorithm, setAlgorithm] = useState<OtpAlgorithm>('SHA1');
  const [digits, setDigits] = useState<OtpDigits>(6);
  const [uri, setUri] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSaveManual = async (): Promise<void> => {
    setError(null);
    setSaving(true);
    try {
      createTotpEntryManually(session, {
        credentialId,
        issuer,
        account,
        secret,
        algorithm,
        digits,
        mode: 'totp',
        period: 30,
        counter: null,
      });
      navigation.goBack();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add authenticator');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveUri = async (): Promise<void> => {
    setError(null);
    setSaving(true);
    try {
      createTotpEntryFromOtpauthUri(session, uri, credentialId);
      navigation.goBack();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not parse this code');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen scroll>
      <Text style={[styles.title, { color: theme.colors.textPrimary, fontSize: theme.typography.title.fontSize }]}>
        Add authenticator
      </Text>

      <Chips options={['manual', 'uri'] as EntryMode[]} selected={entryMode} onSelect={setEntryMode} />

      <Text style={[styles.qrNote, { color: theme.colors.textMuted }]}>
        QR scanning isn't available yet — this build supports manual entry and pasting an otpauth:// code only.
      </Text>

      {entryMode === 'manual' ? (
        <>
          <TextField label="Issuer" testID="issuer-input" value={issuer} onChangeText={setIssuer} />
          <TextField label="Account" testID="account-input" value={account} onChangeText={setAccount} autoCapitalize="none" />
          <TextField label="Secret (base32)" testID="secret-input" value={secret} onChangeText={setSecret} autoCapitalize="characters" />

          <Text style={[styles.sectionLabel, { color: theme.colors.textSecondary }]}>Algorithm</Text>
          <Chips options={ALGORITHMS} selected={algorithm} onSelect={setAlgorithm} />

          <Text style={[styles.sectionLabel, { color: theme.colors.textSecondary }]}>Digits</Text>
          <Chips options={DIGIT_OPTIONS} selected={digits} onSelect={setDigits} />

          {error && (
            <Text testID="form-error" style={[styles.error, { color: theme.colors.danger }]}>
              {error}
            </Text>
          )}
          <Button label="Add" onPress={handleSaveManual} loading={saving} testID="save-manual-button" />
        </>
      ) : (
        <>
          <TextField
            label="otpauth:// code"
            testID="uri-input"
            value={uri}
            onChangeText={setUri}
            autoCapitalize="none"
            multiline
          />
          {error && (
            <Text testID="form-error" style={[styles.error, { color: theme.colors.danger }]}>
              {error}
            </Text>
          )}
          <Button label="Add" onPress={handleSaveUri} loading={saving} testID="save-uri-button" />
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontWeight: '700', marginBottom: 16 },
  qrNote: { marginBottom: 16, fontSize: 12 },
  sectionLabel: { fontSize: 13, fontWeight: '600', marginBottom: 8, marginTop: 4 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  chip: { paddingVertical: 8, paddingHorizontal: 16 },
  error: { marginBottom: 16 },
});
