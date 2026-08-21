import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';

interface OptionRowProps<T extends string> {
  options: T[];
  selected: T;
  onSelect: (value: T) => void;
}

export function OptionRow<T extends string>({ options, selected, onSelect }: OptionRowProps<T>) {
  const theme = useTheme();
  return (
    <View style={styles.optionRow}>
      {options.map((option) => {
        const isSelected = option === selected;
        return (
          <Pressable
            key={option}
            testID={`option-${option}`}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected }}
            onPress={() => onSelect(option)}
            style={[
              styles.optionChip,
              {
                backgroundColor: isSelected ? theme.colors.primary : theme.colors.surface,
                borderRadius: theme.radius.pill,
              },
            ]}
          >
            <Text style={{ color: isSelected ? theme.colors.onPrimary : theme.colors.textPrimary }}>{option}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  optionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 24 },
  optionChip: { paddingVertical: 8, paddingHorizontal: 16 },
});
