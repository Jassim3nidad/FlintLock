import { createMockMMKV } from 'react-native-mmkv/lib/createMMKV/createMockMMKV';

export const preferencesStorage = createMockMMKV({ id: 'flintlock-preferences' });
