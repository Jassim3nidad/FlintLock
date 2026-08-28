import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { useVaultSession } from '../state/VaultSessionProvider';

/**
 * Renders whenever SessionClipboardGuard confirms a lock-triggered
 * clipboard clear failed (checked on next foreground, not at lock time —
 * see that class's doc comment for why). Deliberately generic: never
 * names the credential, field, or value that might still be on the
 * clipboard — SessionClipboardGuard itself never carries that
 * information this far, specifically so this banner can't leak it even
 * by accident. "Something copied" is the most specific this can honestly
 * be, since the app has no way to know what's actually on the system
 * clipboard right now without another read that this banner doesn't
 * perform.
 *
 * Mounted once, at the root of the unlocked app shell (RootNavigator),
 * not per-screen — so it's visible regardless of which screen the app
 * happens to be showing when the failure is detected.
 */
export function ClipboardWarningBanner() {
  const theme = useTheme();
  const { isClipboardWarningActive, dismissClipboardWarning } = useVaultSession();

  if (!isClipboardWarningActive) return null;

  return (
    <View
      testID="clipboard-warning-banner"
      style={[styles.container, { backgroundColor: theme.colors.warning, paddingTop: theme.spacing.md }]}
    >
      <Text style={[styles.text, { color: theme.colors.textPrimary }]}>
        Your clipboard may still contain a copied item.
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Dismiss clipboard warning"
        onPress={dismissClipboardWarning}
        hitSlop={8}
        testID="dismiss-clipboard-warning-button"
      >
        <Text style={[styles.dismiss, { color: theme.colors.textPrimary }]}>Dismiss</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  text: { flex: 1, fontSize: 13, fontWeight: '600', marginRight: 12 },
  dismiss: { fontSize: 13, fontWeight: '700' },
});
