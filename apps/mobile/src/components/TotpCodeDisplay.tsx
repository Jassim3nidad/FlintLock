import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { useVaultSession } from '../state/VaultSessionProvider';
import { TotpEntry } from '../storage/schema';
import { getCurrentCode, getTotpEntry } from '../vault/totpService';

interface TotpCodeDisplayProps {
  entry: TotpEntry;
  onCopy?: (code: string) => void;
}

/**
 * For TOTP, re-derives the code every second — generateTotp() is a pure
 * function of the current time, so this never mutates anything. For
 * HOTP, the code is only (re)computed when the user explicitly taps
 * "Generate" — getCurrentCode() advances and persists the counter as a
 * side effect for HOTP, so calling it on every tick would silently burn
 * through codes the user never asked for.
 */
export function TotpCodeDisplay({ entry, onCopy }: TotpCodeDisplayProps) {
  const theme = useTheme();
  const { session } = useVaultSession();
  const [nowSeconds, setNowSeconds] = useState(() => Math.floor(Date.now() / 1000));
  const [hotpCode, setHotpCode] = useState<string | null>(null);

  useEffect(() => {
    if (entry.mode !== 'totp') return undefined;
    const id = setInterval(() => setNowSeconds(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(id);
  }, [entry.mode]);

  if (entry.mode === 'totp') {
    const { code, secondsRemaining } = getCurrentCode(session, entry, nowSeconds);
    const fraction = secondsRemaining !== null ? secondsRemaining / entry.period : 0;
    return (
      <View style={styles.container}>
        <View style={styles.row}>
          <Pressable
            testID={`totp-code-${entry.id}`}
            accessibilityRole="button"
            accessibilityLabel="Copy authenticator code"
            onPress={() => onCopy?.(code)}
          >
            <Text testID={`totp-code-text-${entry.id}`} style={[styles.code, { color: theme.colors.textPrimary }]}>
              {formatCode(code)}
            </Text>
          </Pressable>
          <Text testID={`totp-countdown-${entry.id}`} style={{ color: theme.colors.textMuted }}>
            {secondsRemaining}s
          </Text>
        </View>
        <View style={[styles.progressTrack, { backgroundColor: theme.colors.surface }]}>
          <View
            testID={`totp-progress-${entry.id}`}
            style={[styles.progressFill, { backgroundColor: theme.colors.primary, width: `${fraction * 100}%` }]}
          />
        </View>
      </View>
    );
  }

  const handleGenerate = (): void => {
    // Re-fetch: the entry prop may be stale if a previous generation
    // already advanced the counter elsewhere.
    const latest = getTotpEntry(session, entry.id) ?? entry;
    const { code } = getCurrentCode(session, latest);
    setHotpCode(code);
  };

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <Pressable
          testID={`totp-code-${entry.id}`}
          accessibilityRole="button"
          accessibilityLabel="Copy authenticator code"
          onPress={() => hotpCode && onCopy?.(hotpCode)}
        >
          <Text testID={`totp-code-text-${entry.id}`} style={[styles.code, { color: theme.colors.textPrimary }]}>
            {hotpCode ? formatCode(hotpCode) : '------'}
          </Text>
        </Pressable>
        <Pressable
          testID={`totp-generate-${entry.id}`}
          accessibilityRole="button"
          accessibilityLabel="Generate next code"
          onPress={handleGenerate}
        >
          <Text style={[styles.generateLabel, { color: theme.colors.primary }]}>Generate</Text>
        </Pressable>
      </View>
    </View>
  );
}

function formatCode(code: string): string {
  const half = Math.ceil(code.length / 2);
  return `${code.slice(0, half)} ${code.slice(half)}`;
}

const styles = StyleSheet.create({
  container: { marginBottom: 16 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  code: { fontSize: 24, fontWeight: '700', letterSpacing: 2, fontVariant: ['tabular-nums'] },
  progressTrack: { height: 4, borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: 4 },
  generateLabel: { fontWeight: '600' },
});
