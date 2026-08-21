jest.mock('../../crypto/native');
jest.mock('../../storage/native');

import { Buffer } from '../../crypto';
import { vaultStorage } from '../../storage/native';
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
  vaultStorage.clearAll();
});

afterEach(() => {
  // Every unlocked session leaves a pending real-timer auto-lock
  // scheduled; lock() cancels it so Jest can exit cleanly.
  while (openSessions.length > 0) openSessions.pop()!.lock();
});

describe('createCredential / getCredential', () => {
  it('creates a credential with sane defaults and round-trips it', async () => {
    const session = await newSession();
    const created = createCredential(session, NEW_CREDENTIAL_INPUT);

    expect(created.recordType).toBe('credential');
    expect(created.deletedAt).toBeNull();
    expect(created.lastUsedAt).toBeNull();
    expect(created.passwordHistory).toEqual([]);

    expect(getCredential(session, created.id)).toEqual(created);
  });
});

describe('updateCredential', () => {
  it('updates fields and bumps updatedAt', async () => {
    const session = await newSession();
    const created = createCredential(session, NEW_CREDENTIAL_INPUT);
    const updated = updateCredential(session, created.id, { title: 'Renamed' });
    expect(updated.title).toBe('Renamed');
    expect(updated.updatedAt).toBeGreaterThanOrEqual(created.updatedAt);
  });

  it('a non-password edit does not change passwordUpdatedAt (password age tracking survives unrelated edits)', async () => {
    const session = await newSession();
    const created = createCredential(session, NEW_CREDENTIAL_INPUT);
    const afterPasswordChange = updateCredential(session, created.id, { password: 'new-password' });

    const afterTitleEdit = updateCredential(session, created.id, { title: 'Renamed only' });
    expect(afterTitleEdit.passwordUpdatedAt).toBe(afterPasswordChange.passwordUpdatedAt);
    expect(afterTitleEdit.updatedAt).toBeGreaterThanOrEqual(afterPasswordChange.updatedAt);

    // And a *subsequent* password change's history entry is timestamped
    // with when it actually happened, not with the intervening title
    // edit's updatedAt.
    const afterSecondPasswordChange = updateCredential(session, created.id, { password: 'newer-password' });
    const lastHistoryEntry = afterSecondPasswordChange.passwordHistory.at(-1)!;
    expect(lastHistoryEntry.password).toBe('new-password');
    expect(lastHistoryEntry.changedAt).toBe(afterSecondPasswordChange.passwordUpdatedAt);
  });

  it('pushes the previous password onto history only when the password actually changes', async () => {
    const session = await newSession();
    const created = createCredential(session, NEW_CREDENTIAL_INPUT);

    const samePassword = updateCredential(session, created.id, { password: 'hunter2', title: 'Renamed' });
    expect(samePassword.passwordHistory).toEqual([]);

    const changed = updateCredential(session, created.id, { password: 'new-password' });
    expect(changed.passwordHistory).toHaveLength(1);
    expect(changed.passwordHistory[0]).toMatchObject({ password: 'hunter2' });
  });

  it('throws for an id that is not a credential', async () => {
    const session = await newSession();
    expect(() => updateCredential(session, 'does-not-exist', { title: 'x' })).toThrow(/no credential/i);
  });
});

describe('recordCredentialUsed', () => {
  it('sets lastUsedAt', async () => {
    const session = await newSession();
    const created = createCredential(session, NEW_CREDENTIAL_INPUT);
    expect(created.lastUsedAt).toBeNull();
    recordCredentialUsed(session, created.id);
    expect(getCredential(session, created.id)!.lastUsedAt).not.toBeNull();
  });
});

describe('soft delete / restore / trash', () => {
  it('soft-deleted credentials are excluded from listCredentials by default', async () => {
    const session = await newSession();
    const a = createCredential(session, { ...NEW_CREDENTIAL_INPUT, title: 'A' });
    createCredential(session, { ...NEW_CREDENTIAL_INPUT, title: 'B' });

    softDeleteCredential(session, a.id);

    expect(listCredentials(session).map((c) => c.title)).toEqual(['B']);
    expect(listCredentials(session, { includeTrashed: true }).map((c) => c.title).sort()).toEqual(['A', 'B']);
    expect(getCredential(session, a.id)!.deletedAt).not.toBeNull();
  });

  it('restore clears deletedAt', async () => {
    const session = await newSession();
    const a = createCredential(session, NEW_CREDENTIAL_INPUT);
    softDeleteCredential(session, a.id);
    restoreCredential(session, a.id);
    expect(getCredential(session, a.id)!.deletedAt).toBeNull();
    expect(listCredentials(session)).toHaveLength(1);
  });

  it('hardDeleteCredential removes the record entirely, even from the trash view', async () => {
    const session = await newSession();
    const a = createCredential(session, NEW_CREDENTIAL_INPUT);
    softDeleteCredential(session, a.id);
    hardDeleteCredential(session, a.id);
    expect(getCredential(session, a.id)).toBeUndefined();
    expect(listCredentials(session, { includeTrashed: true })).toHaveLength(0);
  });
});

describe('purgeExpiredTrash', () => {
  it('purges only trashed credentials past the retention window', async () => {
    const session = await newSession();
    const old = createCredential(session, { ...NEW_CREDENTIAL_INPUT, title: 'Old' });
    const recent = createCredential(session, { ...NEW_CREDENTIAL_INPUT, title: 'Recent' });
    const notTrashed = createCredential(session, { ...NEW_CREDENTIAL_INPUT, title: 'Active' });

    softDeleteCredential(session, old.id);
    softDeleteCredential(session, recent.id);

    // Backdate `old`'s deletedAt past the retention window directly in storage.
    const staleDeletedAt = Date.now() - TRASH_RETENTION_MS - 1000;
    session.vault.putRecord({ ...getCredential(session, old.id)!, deletedAt: staleDeletedAt });

    const purgedIds = purgeExpiredTrash(session);

    expect(purgedIds).toEqual([old.id]);
    expect(getCredential(session, old.id)).toBeUndefined();
    expect(getCredential(session, recent.id)).toBeDefined(); // trashed but not expired
    expect(getCredential(session, notTrashed.id)).toBeDefined(); // never trashed
  });
});
