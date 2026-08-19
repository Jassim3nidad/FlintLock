/**
 * Jest test double for ./native — uses react-native-mmkv's own
 * createMockMMKV(), an in-memory implementation of the same MMKV
 * interface the library ships specifically for tests.
 */
// Not part of the package's public root export, but there's no "exports"
// map restricting deep imports, and this is the file the library itself
// ships specifically for test doubles (see its own createMockMMKV.d.ts).
import { createMockMMKV } from 'react-native-mmkv/lib/createMMKV/createMockMMKV';

export const vaultStorage = createMockMMKV({ id: 'flintlock-vault' });
