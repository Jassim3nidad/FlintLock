import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, TextInputProps, View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';

interface TextFieldProps extends Omit<TextInputProps, 'style'> {
  label: string;
  error?: string;
  /** Shows a show/hide toggle instead of always-masked text. */
  isPassword?: boolean;
  testID?: string;
}

export function TextField({ label, error, isPassword, testID, ...inputProps }: TextFieldProps) {
  const theme = useTheme();
  const [revealed, setRevealed] = useState(false);

  const borderColor = error ? theme.colors.danger : theme.colors.inputBorder;

  return (
    <View style={styles.container}>
      <Text style={[styles.label, { color: theme.colors.textSecondary, fontSize: theme.typography.label.fontSize }]}>
        {label}
      </Text>
      <View style={styles.inputRow}>
        <TextInput
          testID={testID}
          accessibilityLabel={label}
          style={[
            styles.input,
            {
              color: theme.colors.textPrimary,
              borderColor,
              borderRadius: theme.radius.md,
              backgroundColor: theme.colors.surface,
              fontSize: theme.typography.body.fontSize,
            },
          ]}
          placeholderTextColor={theme.colors.textMuted}
          secureTextEntry={isPassword && !revealed}
          autoCapitalize="none"
          autoCorrect={false}
          {...inputProps}
        />
        {isPassword && (
          <Pressable
            testID={testID ? `${testID}-toggle-reveal` : undefined}
            accessibilityRole="button"
            accessibilityLabel={revealed ? 'Hide password' : 'Show password'}
            onPress={() => setRevealed((v) => !v)}
            hitSlop={8}
          >
            <Text style={[styles.toggle, { color: theme.colors.primary }]}>{revealed ? 'Hide' : 'Show'}</Text>
          </Pressable>
        )}
      </View>
      {error ? (
        <Text style={[styles.error, { color: theme.colors.danger, fontSize: theme.typography.caption.fontSize }]}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: 16 },
  label: { marginBottom: 6, fontWeight: '500' },
  inputRow: { flexDirection: 'row', alignItems: 'center' },
  input: { flex: 1, borderWidth: 1, paddingVertical: 10, paddingHorizontal: 12 },
  toggle: { marginLeft: 12, fontWeight: '600' },
  error: { marginTop: 4 },
});
