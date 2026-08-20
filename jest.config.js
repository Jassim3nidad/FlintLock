module.exports = {
  preset: '@react-native/jest-preset',
  // The preset's default only allow-lists RN's own scoped packages;
  // several other native/navigation libraries ship ESM in node_modules
  // and need transforming too, or Jest chokes on their `export` syntax.
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|react-native-mmkv|@react-navigation|react-native-screens|react-native-gesture-handler|@react-native-clipboard)/)',
  ],
  // Explicitly listing setupFiles overrides (not merges with) the
  // preset's own value, so both are named here: the preset's, which the
  // rest of the suite already depends on, plus gesture-handler's own
  // jest mock for the native module App.tsx pulls in via
  // GestureHandlerRootView.
  setupFiles: [
    require.resolve('@react-native/jest-preset/jest/setup.js'),
    require.resolve('react-native-gesture-handler/jestSetup.js'),
  ],
};
