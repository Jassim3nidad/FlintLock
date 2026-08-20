jest.mock('../../crypto/native');
jest.mock('../../storage/native');

import { Buffer, DecryptionError } from '../../crypto';
import { vaultStorage } from '../../storage/native';
import { VaultStore } from '../../storage/vaultStore';
import { UnlockSession } from '../../unlock/session';
import { createCredential } from '../../vault/credentialService';
import { commitFlbxImport, exportFlbx, previewFlbxImport } from '../flbxService';

const FAST_KDF = { kdf: 'pbkdf2' as const, iterations: 100, digest: 'sha256' as const };
const PASSWORD = Buffer.from('correct horse battery staple');
const openSessions: UnlockSession[] = [];

const BASE_INPUT = {
  urls: [] as string[],
  notes: '',
  tagIds: [] as string[],
  customFields: [] as never[],
  favorite: false,
};

async function newSession(): Promise<UnlockSession> {
  await VaultStore.create(PASSWORD, FAST_KDF);
  const session = new UnlockSession();
  await session.unlockWithPassword(PASSWORD);
  openSessions.push(session);
  return session;
}

beforeEach(() => {
  vaultStorage.clearAll();
});

afterEach(() => {
  while (openSessions.length > 0) openSessions.pop()!.lock();
});

describe('exportFlbx / previewFlbxImport — round trip', () => {
  it('exports every record and imports them all as "add" into a fresh vault', async () => {
    const source = await newSession();
    createCredential(source, { ...BASE_INPUT, title: 'A', username: 'a', password: 'x' });
    createCredential(source, { ...BASE_INPUT, title: 'B', username: 'b', password: 'y' });

    const file = await exportFlbx(source, PASSWORD, FAST_KDF);

    vaultStorage.clearAll();
    const target = await newSession();
    const preview = await previewFlbxImport(target, PASSWORD, file);

    expect(preview.payload.records).toHaveLength(2);
    expect(preview.entries.every((e) => e.action === 'add')).toBe(true);
  });

  it('rejects the wrong password at preview time, before any write is possible', async () => {
    const source = await newSession();
    createCredential(source, { ...BASE_INPUT, title: 'A', username: 'a', password: 'x' });
    const file = await exportFlbx(source, PASSWORD, FAST_KDF);

    vaultStorage.clearAll();
    const target = await newSession();
    await expect(previewFlbxImport(target, Buffer.from('wrong'), file)).rejects.toThrow(DecryptionError);
  });
});

describe('commitFlbxImport — merge', () => {
  it('adds new records, updates changed ones, and leaves unrelated existing records alone', async () => {
    const source = await newSession();
    const shared = createCredential(source, { ...BASE_INPUT, title: 'Shared-Old', username: 'a', password: 'x' });
    createCredential(source, { ...BASE_INPUT, title: 'OnlyInExport', username: 'b', password: 'y' });
    const file = await exportFlbx(source, PASSWORD, FAST_KDF);

    vaultStorage.clearAll();
    const target = await newSession();
    // Recreate the "shared" credential in the target with the same id but different content.
    target.vault.putRecord({ ...shared, title: 'Shared-Local-Version' });
    const onlyInTarget = createCredential(target, { ...BASE_INPUT, title: 'OnlyInTarget', username: 'c', password: 'z' });

    const preview = await previewFlbxImport(target, PASSWORD, file);
    commitFlbxImport(target, preview, 'merge');

    expect(target.vault.getRecord(shared.id)).toMatchObject({ title: 'Shared-Old' }); // import wins
    expect(target.vault.listIndex()).toHaveLength(3); // shared + onlyInExport + onlyInTarget
    expect(target.vault.getRecord(onlyInTarget.id)).toBeDefined(); // untouched, not deleted
  });

  it('is idempotent — importing the same file twice in a row makes no further changes the second time', async () => {
    const source = await newSession();
    createCredential(source, { ...BASE_INPUT, title: 'A', username: 'a', password: 'x' });
    const file = await exportFlbx(source, PASSWORD, FAST_KDF);

    vaultStorage.clearAll();
    const target = await newSession();

    const firstPreview = await previewFlbxImport(target, PASSWORD, file);
    commitFlbxImport(target, firstPreview, 'merge');
    const afterFirst = target.vault.listIndex();

    const secondPreview = await previewFlbxImport(target, PASSWORD, file);
    expect(secondPreview.entries.every((e) => e.action === 'unchanged')).toBe(true);
    commitFlbxImport(target, secondPreview, 'merge');
    const afterSecond = target.vault.listIndex();

    expect(afterSecond).toEqual(afterFirst);
  });
});

describe('commitFlbxImport — replace', () => {
  it('wipes existing records not present in the import and replaces the vault contents entirely', async () => {
    const source = await newSession();
    createCredential(source, { ...BASE_INPUT, title: 'FromExport', username: 'a', password: 'x' });
    const file = await exportFlbx(source, PASSWORD, FAST_KDF);

    vaultStorage.clearAll();
    const target = await newSession();
    const willBeWiped = createCredential(target, { ...BASE_INPUT, title: 'LocalOnly', username: 'b', password: 'y' });

    const preview = await previewFlbxImport(target, PASSWORD, file);
    commitFlbxImport(target, preview, 'replace');

    expect(target.vault.getRecord(willBeWiped.id)).toBeUndefined();
    expect(target.vault.listIndex()).toHaveLength(1);
    expect(target.vault.listIndex()[0]!.recordType).toBe('credential');
  });
});
