import { Buffer } from 'buffer';
import { configureTestPlatform, resetPlatformForTests } from '../../testing/configureTestPlatform';
import { VaultStore } from '../../storage/vaultStore';
import { UnlockSession } from '../../unlock/session';
import {
  createCredential,
  getCredential,
  hardDeleteCredential,
  listCredentials,
  purgeExpiredTrash,
  recordCredentialUsed,
  restoreCredential,
  softDeleteCredential,
  TRASH_RETENTION_MS,
  updateCredential,
} from '../credentialService';

const FAST_KDF = { kdf: 'pbkdf2' as const, iterations: 100, digest: 'sha256' as const };
const PASSWORD = Buffer.from('pw');

const openSessions: UnlockSession[] = [];

async function newSession(): Promise<UnlockSession> {
  await VaultStore.create(PASSWORD, FAST_KDF);
  const session = new UnlockSession();
  await session.unlockWithPassword(PASSWORD);
  openSessions.push(session);
  return session;
}

const NEW_CREDENTIAL_INPUT = {
  title: 'Example',
  username: 'alice',
  password: 'hunter2',
  urls: ['https://example.com'],
  notes: '',
  tagIds: [],
  customFields: [],
  favorite: false,
};

beforeEach(() => {
  configureTestPlatform();
});

afterEach(() => {
  while (openSessions.length > 0) openSessions.pop()!.lock();
  resetPlatformForTests();
});

describe('createCredential / getCredential', () => {
  it('creates a credential with sane defaults and round-trips it', async () => {
    const session = await newSession();
    const created = await createCredential(session, NEW_CREDENTIAL_INPUT);

    expect(created.recordType).toBe('credential');
    expect(created.deletedAt).toBeNull();
    expect(created.lastUsedAt).toBeNull();
    expect(created.passwordHistory).toEqual([]);

    expect(await getCredential(session, created.id)).toEqual(created);
  });
});

describe('updateCredential', () => {
  it('updates fields and bumps updatedAt', async () => {
    const session = await newSession();
    const created = await createCredential(session, NEW_CREDENTIAL_INPUT);
    const updated = await updateCredential(session, created.id, { title: 'Renamed' });
    expect(updated.title).toBe('Renamed');
    expect(updated.updatedAt).toBeGreaterThanOrEqual(created.updatedAt);
  });

  it('a non-password edit does not change passwordUpdatedAt (password age tracking survives unrelated edits)', async () => {
    const session = await newSession();
    const created = await createCredential(session, NEW_CREDENTIAL_INPUT);
    const afterPasswordChange = await updateCredential(session, created.id, { password: 'new-password' });

    const afterTitleEdit = await updateCredential(session, created.id, { title: 'Renamed only' });
    expect(afterTitleEdit.passwordUpdatedAt).toBe(afterPasswordChange.passwordUpdatedAt);
    expect(afterTitleEdit.updatedAt).toBeGreaterThanOrEqual(afterPasswordChange.updatedAt);

    // And a *subsequent* password change's history entry is timestamped
    // with when it actually happened, not with the intervening title
    // edit's updatedAt.
    const afterSecondPasswordChange = await updateCredential(session, created.id, { password: 'newer-password' });
    const lastHistoryEntry = afterSecondPasswordChange.passwordHistory.at(-1)!;
    expect(lastHistoryEntry.password).toBe('new-password');
    expect(lastHistoryEntry.changedAt).toBe(afterSecondPasswordChange.passwordUpdatedAt);
  });

  it('pushes the previous password onto history only when the password actually changes', async () => {
    const session = await newSession();
    const created = await createCredential(session, NEW_CREDENTIAL_INPUT);

    const samePassword = await updateCredential(session, created.id, { password: 'hunter2', title: 'Renamed' });
    expect(samePassword.passwordHistory).toEqual([]);

    const changed = await updateCredential(session, created.id, { password: 'new-password' });
    expect(changed.passwordHistory).toHaveLength(1);
    expect(changed.passwordHistory[0]).toMatchObject({ password: 'hunter2' });
  });

  it('throws for an id that is not a credential', async () => {
    const session = await newSession();
    await expect(updateCredential(session, 'does-not-exist', { title: 'x' })).rejects.toThrow(/no credential/i);
  });
});

describe('recordCredentialUsed', () => {
  it('sets lastUsedAt', async () => {
    const session = await newSession();
    const created = await createCredential(session, NEW_CREDENTIAL_INPUT);
    expect(created.lastUsedAt).toBeNull();
    await recordCredentialUsed(session, created.id);
    expect((await getCredential(session, created.id))!.lastUsedAt).not.toBeNull();
  });
});

describe('soft delete / restore / trash', () => {
  it('soft-deleted credentials are excluded from listCredentials by default', async () => {
    const session = await newSession();
    const a = await createCredential(session, { ...NEW_CREDENTIAL_INPUT, title: 'A' });
    await createCredential(session, { ...NEW_CREDENTIAL_INPUT, title: 'B' });

    await softDeleteCredential(session, a.id);

    expect((await listCredentials(session)).map((c) => c.title)).toEqual(['B']);
    expect(
      (await listCredentials(session, { includeTrashed: true })).map((c) => c.title).sort()
    ).toEqual(['A', 'B']);
    expect((await getCredential(session, a.id))!.deletedAt).not.toBeNull();
  });

  it('restore clears deletedAt', async () => {
    const session = await newSession();
    const a = await createCredential(session, NEW_CREDENTIAL_INPUT);
    await softDeleteCredential(session, a.id);
    await restoreCredential(session, a.id);
    expect((await getCredential(session, a.id))!.deletedAt).toBeNull();
    expect(await listCredentials(session)).toHaveLength(1);
  });

  it('hardDeleteCredential removes the record entirely, even from the trash view', async () => {
    const session = await newSession();
    const a = await createCredential(session, NEW_CREDENTIAL_INPUT);
    await softDeleteCredential(session, a.id);
    await hardDeleteCredential(session, a.id);
    expect(await getCredential(session, a.id)).toBeUndefined();
    expect(await listCredentials(session, { includeTrashed: true })).toHaveLength(0);
  });
});

describe('purgeExpiredTrash', () => {
  it('purges only trashed credentials past the retention window', async () => {
    const session = await newSession();
    const old = await createCredential(session, { ...NEW_CREDENTIAL_INPUT, title: 'Old' });
    const recent = await createCredential(session, { ...NEW_CREDENTIAL_INPUT, title: 'Recent' });
    const notTrashed = await createCredential(session, { ...NEW_CREDENTIAL_INPUT, title: 'Active' });

    await softDeleteCredential(session, old.id);
    await softDeleteCredential(session, recent.id);

    // Backdate `old`'s deletedAt past the retention window directly in storage.
    const staleDeletedAt = Date.now() - TRASH_RETENTION_MS - 1000;
    await session.vault.putRecord({ ...(await getCredential(session, old.id))!, deletedAt: staleDeletedAt });

    const purgedIds = await purgeExpiredTrash(session);

    expect(purgedIds).toEqual([old.id]);
    expect(await getCredential(session, old.id)).toBeUndefined();
    expect(await getCredential(session, recent.id)).toBeDefined(); // trashed but not expired
    expect(await getCredential(session, notTrashed.id)).toBeDefined(); // never trashed
  });
});
