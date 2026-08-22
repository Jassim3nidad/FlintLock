import React, { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Screen } from '../components/Screen';
import { Button } from '../components/Button';
import { useTheme } from '../theme/ThemeProvider';
import { useVaultSession } from '../state/VaultSessionProvider';
import { analyzeSecurity, SecurityDashboardReport } from '@flintlock/core';
import type { MainStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<MainStackParamList>;

const EMPTY_REPORT: SecurityDashboardReport = {
  weakPasswords: [],
  reusedPasswords: [],
  oldPasswords: [],
  missingTwoFactor: [],
  generatedAt: 0,
};

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  const theme = useTheme();
  if (count === 0) return null;
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionLabel, { color: theme.colors.textSecondary }]}>
        {title} ({count})
      </Text>
      {children}
    </View>
  );
}

export function SecurityDashboardScreen() {
  const theme = useTheme();
  const navigation = useNavigation<Nav>();
  const { session } = useVaultSession();
  const [report, setReport] = useState<SecurityDashboardReport>(EMPTY_REPORT);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      analyzeSecurity(session).then((r) => {
        if (!cancelled) setReport(r);
      });
      return () => {
        cancelled = true;
      };
    }, [session])
  );

  const goToCredential = (credentialId: string): void => {
    navigation.navigate('CredentialDetail', { credentialId });
  };

  const totalFindings =
    report.weakPasswords.length + report.reusedPasswords.length + report.oldPasswords.length + report.missingTwoFactor.length;

  return (
    <Screen scroll>
      <Text style={[styles.title, { color: theme.colors.textPrimary, fontSize: theme.typography.title.fontSize }]}>
        Security dashboard
      </Text>

      {totalFindings === 0 && (
        <Text testID="security-all-clear" style={{ color: theme.colors.textSecondary }}>
          No issues found — nice work.
        </Text>
      )}

      <Section title="Weak passwords" count={report.weakPasswords.length}>
        {report.weakPasswords.map((finding) => (
          <Pressable
            key={finding.credentialId}
            testID={`weak-password-${finding.credentialId}`}
            accessibilityRole="button"
            onPress={() => goToCredential(finding.credentialId)}
            style={[styles.row, { borderBottomColor: theme.colors.divider }]}
          >
            <Text style={{ color: theme.colors.textPrimary }}>{finding.title}</Text>
            <Text style={[styles.meta, { color: theme.colors.textMuted }]}>~{Math.round(finding.estimatedEntropyBits)} bits</Text>
          </Pressable>
        ))}
      </Section>

      <Section title="Reused passwords" count={report.reusedPasswords.length}>
        {report.reusedPasswords.map((group, index) => (
          <View key={index} testID={`reused-group-${index}`} style={styles.reusedGroup}>
            {group.credentialIds.map((id, i) => (
              <Pressable
                key={id}
                testID={`reused-credential-${id}`}
                accessibilityRole="button"
                onPress={() => goToCredential(id)}
                style={[styles.row, { borderBottomColor: theme.colors.divider }]}
              >
                <Text style={{ color: theme.colors.textPrimary }}>{group.titles[i]}</Text>
              </Pressable>
            ))}
          </View>
        ))}
      </Section>

      <Section title="Old passwords" count={report.oldPasswords.length}>
        {report.oldPasswords.map((finding) => (
          <Pressable
            key={finding.credentialId}
            testID={`old-password-${finding.credentialId}`}
            accessibilityRole="button"
            onPress={() => goToCredential(finding.credentialId)}
            style={[styles.row, { borderBottomColor: theme.colors.divider }]}
          >
            <Text style={{ color: theme.colors.textPrimary }}>{finding.title}</Text>
            <Text style={[styles.meta, { color: theme.colors.textMuted }]}>{finding.passwordAgeDays} days old</Text>
          </Pressable>
        ))}
      </Section>

      <Section title="Missing 2FA" count={report.missingTwoFactor.length}>
        {report.missingTwoFactor.map((finding) => (
          <Pressable
            key={finding.credentialId}
            testID={`missing-2fa-${finding.credentialId}`}
            accessibilityRole="button"
            onPress={() => goToCredential(finding.credentialId)}
            style={[styles.row, { borderBottomColor: theme.colors.divider }]}
          >
            <Text style={{ color: theme.colors.textPrimary }}>{finding.title}</Text>
          </Pressable>
        ))}
      </Section>

      <View style={styles.spacer} />
      <Button label="Back" onPress={() => navigation.goBack()} variant="secondary" testID="back-button" />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontWeight: '700', marginBottom: 24 },
  section: { marginBottom: 24 },
  sectionLabel: { fontSize: 13, fontWeight: '600', marginBottom: 8 },
  reusedGroup: { marginBottom: 8 },
  meta: { fontSize: 12 },
  row: { paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', justifyContent: 'space-between' },
  spacer: { height: 12 },
});
