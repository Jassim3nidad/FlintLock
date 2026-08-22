import { Buffer } from 'buffer';
import { DecryptionError } from '../../crypto/types';
import { configureTestPlatform, resetPlatformForTests } from '../../testing/configureTestPlatform';
import { SecureStore } from '../SecureStore';
import { VaultStore } from '../vaultStore';
import { Credential, Tag } from '../schema';

let secureStore: SecureStore;

beforeEach(() => {
  ({ secureStore } = configureTestPlatform());
});

afterEach(() => {
  resetPlatformForTests();
});

function makeCredential(overrides: Partial<Credential> = {}): Credential {
  const now = Date.now();
  return {
    id: 'cred-1',
    recordType: 'credential',
    title: 'Example',
    username: 'alice',
    password: 'hunter2',
    urls: ['https://example.com'],
    notes: '',
    tagIds: [],
    customFields: [],
    favorite: false,
    passwordHistory: [],
    createdAt: now,
    updatedAt: now,
    passwordUpdatedAt: now,
    lastUsedAt: null,
    deletedAt: null,
    ...overrides,
  };
}

const FAST_KDF = { kdf: 'pbkdf2' as const, iterations: 100, digest: 'sha256' as const };

describe('VaultStore.create / open — master password verification', () => {
  it('opens with the correct password after create', async () => {
    await VaultStore.create(Buffer.from('correct horse'), FAST_KDF);
    const store = await VaultStore.open(Buffer.from('correct horse'));
    expect(store.isUnlocked()).toBe(true);
  });

  it('fails closed on the wrong password', async () => {
    await VaultStore.create(Buffer.from('correct horse'), FAST_KDF);
    await expect(VaultStore.open(Buffer.from('wrong password'))).rejects.toThrow(DecryptionError);
  });

  it('refuses to create a second vault over an existing one', async () => {
    await VaultStore.create(Buffer.from('pw'), FAST_KDF);
    await expect(VaultStore.create(Buffer.from('pw2'), FAST_KDF)).rejects.toThrow(/already exists/);
  });

  it('refuses to open when no vault exists', async () => {
    await expect(VaultStore.open(Buffer.from('pw'))).rejects.toThrow(/no vault exists/i);
  });
});

describe('round-trip persistence', () => {
  it('persists a record across separate VaultStore instances (simulated app restart)', async () => {
    const password = Buffer.from('correct horse battery staple');
    const created = await VaultStore.create(password, FAST_KDF);
    const credential = makeCredential();
    await created.putRecord(credential);

    // A fresh VaultStore.open() call re-derives the key and re-reads from
    // the same underlying storage — nothing is held over from `created`.
    const reopened = await VaultStore.open(password);
    const fetched = await reopened.getRecord(credential.id);

    expect(fetched).toEqual(credential);
  });

  it('round-trips a tag record', async () => {
    const password = Buffer.from('pw');
    const store = await VaultStore.create(password, FAST_KDF);
    const tag: Tag = { id: 'tag-1', recordType: 'tag', name: 'Work', color: '#336699' };
    await store.putRecord(tag);
    expect(await store.getRecord('tag-1')).toEqual(tag);
  });

  it('updates the index on put and delete', async () => {
    const store = await VaultStore.create(Buffer.from('pw'), FAST_KDF);
    await store.putRecord(makeCredential({ id: 'a' }));
    await store.putRecord(makeCredential({ id: 'b' }));
    expect((await store.listIndex()).map((e) => e.id).sort()).toEqual(['a', 'b']);

    await store.deleteRecord('a');
    expect((await store.listIndex()).map((e) => e.id)).toEqual(['b']);
    expect(await store.getRecord('a')).toBeUndefined();
  });

  it('overwrites an existing record on put without duplicating the index entry', async () => {
    const store = await VaultStore.create(Buffer.from('pw'), FAST_KDF);
    await store.putRecord(makeCredential({ id: 'a', title: 'First' }));
    await store.putRecord(makeCredential({ id: 'a', title: 'Second' }));
    expect(await store.listIndex()).toHaveLength(1);
    expect(await store.getRecord('a')).toMatchObject({ title: 'Second' });
  });

  it('returns undefined for a record that was never stored', async () => {
    const store = await VaultStore.create(Buffer.from('pw'), FAST_KDF);
    expect(await store.getRecord('does-not-exist')).toBeUndefined();
  });
});

describe('tamper detection — fail closed, never partial data', () => {
  it('throws on a corrupted record instead of returning garbage', async () => {
    const password = Buffer.from('pw');
    const store = await VaultStore.create(password, FAST_KDF);
    await store.putRecord(makeCredential({ id: 'a' }));

    const raw = (await secureStore.getItem('vault:record:a'))!;
    const corrupted = Buffer.from(raw);
    corrupted[corrupted.length - 1]! ^= 0xff; // eslint-disable-line no-bitwise -- flip the last ciphertext byte
    await secureStore.setItem('vault:record:a', corrupted);

    await expect(store.getRecord('a')).rejects.toThrow(DecryptionError);
  });

  it('throws on a tampered header salt (wrong KEK, DEK unwrap fails)', async () => {
    const password = Buffer.from('pw');
    await VaultStore.create(password, FAST_KDF);

    const headerJson = JSON.parse((await secureStore.getItem('vault:header'))!.toString('utf8'));
    const saltBytes = Buffer.from(headerJson.salt, 'base64');
    saltBytes[0]! ^= 0xff; // eslint-disable-line no-bitwise -- corrupt the salt
    headerJson.salt = saltBytes.toString('base64');
    await secureStore.setItem('vault:header', Buffer.from(JSON.stringify(headerJson), 'utf8'));

    await expect(VaultStore.open(password)).rejects.toThrow(DecryptionError);
  });

  it('rejects a record swapped between vaults via AAD binding (record id mismatch)', async () => {
    const password = Buffer.from('pw');
    const store = await VaultStore.create(password, FAST_KDF);
    await store.putRecord(makeCredential({ id: 'a' }));

    // Move the bytes stored under "a" to a different record id — the
    // ciphertext is unmodified, only its AAD-bound identity has changed.
    const raw = (await secureStore.getItem('vault:record:a'))!;
    await secureStore.setItem('vault:record:b', raw);

    await expect(store.getRecord('b')).rejects.toThrow(DecryptionError);
  });
});

describe('lock()', () => {
  it('wipes the DEK and blocks further record access until reopened', async () => {
    const password = Buffer.from('pw');
    const store = await VaultStore.create(password, FAST_KDF);
    await store.putRecord(makeCredential({ id: 'a' }));

    store.lock();
    expect(store.isUnlocked()).toBe(false);
    await expect(store.getRecord('a')).rejects.toThrow(/locked/i);
    await expect(store.putRecord(makeCredential({ id: 'b' }))).rejects.toThrow(/locked/i);
  });
});
