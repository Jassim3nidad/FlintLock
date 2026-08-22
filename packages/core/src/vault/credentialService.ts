import { randomUUID } from '../crypto/csprng';
import { UnlockSession } from '../unlock/session';
import { Credential } from '../storage/schema';

export const TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export type NewCredentialInput = Pick<
  Credential,
  'title' | 'username' | 'password' | 'urls' | 'notes' | 'tagIds' | 'customFields' | 'favorite'
>;

export type CredentialUpdate = Partial<NewCredentialInput>;

async function getCredentialOrThrow(session: UnlockSession, id: string): Promise<Credential> {
  const record = await session.vault.getRecord(id);
  if (!record || record.recordType !== 'credential') {
    throw new Error(`No credential with id ${id}`);
  }
  return record;
}

export async function createCredential(session: UnlockSession, input: NewCredentialInput): Promise<Credential> {
  const now = Date.now();
  const credential: Credential = {
    id: randomUUID(),
    recordType: 'credential',
    createdAt: now,
    updatedAt: now,
    passwordUpdatedAt: now,
    lastUsedAt: null,
    deletedAt: null,
    passwordHistory: [],
    ...input,
  };
  await session.vault.putRecord(credential);
  return credential;
}

export async function getCredential(session: UnlockSession, id: string): Promise<Credential | undefined> {
  const record = await session.vault.getRecord(id);
  return record?.recordType === 'credential' ? record : undefined;
}

/**
 * Applying a password change pushes the *previous* password onto
 * passwordHistory (timestamped with when it stopped being current — now,
 * not existing.updatedAt, which may reflect an unrelated later edit) and
 * bumps passwordUpdatedAt so password-age tracking (security dashboard)
 * stays accurate even across intervening non-password edits.
 */
export async function updateCredential(session: UnlockSession, id: string, changes: CredentialUpdate): Promise<Credential> {
  const existing = await getCredentialOrThrow(session, id);
  const passwordChanged = changes.password !== undefined && changes.password !== existing.password;
  const now = Date.now();

  const updated: Credential = {
    ...existing,
    ...changes,
    updatedAt: now,
    passwordUpdatedAt: passwordChanged ? now : existing.passwordUpdatedAt,
    passwordHistory: passwordChanged
      ? [...existing.passwordHistory, { password: existing.password, changedAt: now }]
      : existing.passwordHistory,
  };
  await session.vault.putRecord(updated);
  return updated;
}

export async function recordCredentialUsed(session: UnlockSession, id: string): Promise<void> {
  const existing = await getCredentialOrThrow(session, id);
  await session.vault.putRecord({ ...existing, lastUsedAt: Date.now() });
}

/** Moves a credential to the trash. Purged automatically after TRASH_RETENTION_MS — see purgeExpiredTrash(). */
export async function softDeleteCredential(session: UnlockSession, id: string): Promise<void> {
  const existing = await getCredentialOrThrow(session, id);
  await session.vault.putRecord({ ...existing, deletedAt: Date.now(), updatedAt: Date.now() });
}

export async function restoreCredential(session: UnlockSession, id: string): Promise<void> {
  const existing = await getCredentialOrThrow(session, id);
  if (existing.deletedAt === null) return;
  await session.vault.putRecord({ ...existing, deletedAt: null, updatedAt: Date.now() });
}

/** Irreversible. The UI is responsible for a confirmation that names the item before calling this. */
export async function hardDeleteCredential(session: UnlockSession, id: string): Promise<void> {
  await session.vault.deleteRecord(id);
}

/** Call periodically (e.g. on app foreground). Returns the ids that were purged. */
export async function purgeExpiredTrash(session: UnlockSession): Promise<string[]> {
  const now = Date.now();
  const purged: string[] = [];
  for (const entry of await session.vault.listIndex()) {
    if (entry.recordType !== 'credential') continue;
    const record = await getCredential(session, entry.id);
    if (record?.deletedAt !== null && record?.deletedAt !== undefined && now - record.deletedAt > TRASH_RETENTION_MS) {
      await session.vault.deleteRecord(entry.id);
      purged.push(entry.id);
    }
  }
  return purged;
}

export async function listCredentials(session: UnlockSession, options: { includeTrashed?: boolean } = {}): Promise<Credential[]> {
  const includeTrashed = options.includeTrashed ?? false;
  const index = await session.vault.listIndex();
  const records = await Promise.all(
    index.filter((entry) => entry.recordType === 'credential').map((entry) => getCredential(session, entry.id))
  );
  return records.filter((c): c is Credential => c !== undefined && (includeTrashed || c.deletedAt === null));
}
