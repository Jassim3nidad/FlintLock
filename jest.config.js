module.exports = {
  preset: '@react-native/jest-preset',
  // The preset's default only allows-lists RN's own scoped packages;
  // react-native-mmkv ships ESM in node_modules (its createMockMMKV test
  // double included), so it needs transforming too.
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|react-native-mmkv)/)',
  ],
};
