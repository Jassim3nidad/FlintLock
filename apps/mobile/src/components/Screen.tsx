import React from 'react';
import { ScrollView, StyleSheet, View, ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeProvider';

interface ScreenProps {
  children: React.ReactNode;
  scroll?: boolean;
  style?: ViewStyle;
}

/** Base screen wrapper: safe-area + theme background. Every screen should be built on this rather than a bare View. */
export function Screen({ children, scroll = false, style }: ScreenProps) {
  const theme = useTheme();
  const Container = scroll ? ScrollView : View;
  const containerProps = scroll ? { contentContainerStyle: [styles.content, style] } : { style: [styles.content, style] };

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.colors.background }]} edges={['top', 'bottom']}>
      <Container {...containerProps}>{children}</Container>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { flexGrow: 1, padding: 16 },
});
