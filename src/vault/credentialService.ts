import { randomUUID } from '../crypto/csprng';
import { UnlockSession } from '../unlock/session';
import { Credential } from '../storage/schema';

export const TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export type NewCredentialInput = Pick<
  Credential,
  'title' | 'username' | 'password' | 'urls' | 'notes' | 'tagIds' | 'customFields' | 'favorite'
>;

export type CredentialUpdate = Partial<NewCredentialInput>;

function getCredentialOrThrow(session: UnlockSession, id: string): Credential {
  const record = session.vault.getRecord(id);
  if (!record || record.recordType !== 'credential') {
    throw new Error(`No credential with id ${id}`);
  }
  return record;
}

export function createCredential(session: UnlockSession, input: NewCredentialInput): Credential {
  const now = Date.now();
  const credential: Credential = {
    id: randomUUID(),
    recordType: 'credential',
    createdAt: now,
    updatedAt: now,
    lastUsedAt: null,
    deletedAt: null,
    passwordHistory: [],
    ...input,
  };
  session.vault.putRecord(credential);
  return credential;
}

export function getCredential(session: UnlockSession, id: string): Credential | undefined {
  const record = session.vault.getRecord(id);
  return record?.recordType === 'credential' ? record : undefined;
}

/**
 * Applying a password change pushes the *previous* password onto
 * passwordHistory, timestamped with when it stopped being current (its
 * own last updatedAt), not with now.
 */
export function updateCredential(session: UnlockSession, id: string, changes: CredentialUpdate): Credential {
  const existing = getCredentialOrThrow(session, id);
  const passwordChanged = changes.password !== undefined && changes.password !== existing.password;

  const updated: Credential = {
    ...existing,
    ...changes,
    updatedAt: Date.now(),
    passwordHistory: passwordChanged
      ? [...existing.passwordHistory, { password: existing.password, changedAt: existing.updatedAt }]
      : existing.passwordHistory,
  };
  session.vault.putRecord(updated);
  return updated;
}

export function recordCredentialUsed(session: UnlockSession, id: string): void {
  const existing = getCredentialOrThrow(session, id);
  session.vault.putRecord({ ...existing, lastUsedAt: Date.now() });
}

/** Moves a credential to the trash. Purged automatically after TRASH_RETENTION_MS — see purgeExpiredTrash(). */
export function softDeleteCredential(session: UnlockSession, id: string): void {
  const existing = getCredentialOrThrow(session, id);
  session.vault.putRecord({ ...existing, deletedAt: Date.now(), updatedAt: Date.now() });
}

export function restoreCredential(session: UnlockSession, id: string): void {
  const existing = getCredentialOrThrow(session, id);
  if (existing.deletedAt === null) return;
  session.vault.putRecord({ ...existing, deletedAt: null, updatedAt: Date.now() });
}

/** Irreversible. The UI is responsible for a confirmation that names the item before calling this. */
export function hardDeleteCredential(session: UnlockSession, id: string): void {
  session.vault.deleteRecord(id);
}

/** Call periodically (e.g. on app foreground). Returns the ids that were purged. */
export function purgeExpiredTrash(session: UnlockSession): string[] {
  const now = Date.now();
  const purged: string[] = [];
  for (const entry of session.vault.listIndex()) {
    if (entry.recordType !== 'credential') continue;
    const record = getCredential(session, entry.id);
    if (record?.deletedAt !== null && record?.deletedAt !== undefined && now - record.deletedAt > TRASH_RETENTION_MS) {
      session.vault.deleteRecord(entry.id);
      purged.push(entry.id);
    }
  }
  return purged;
}

export function listCredentials(session: UnlockSession, options: { includeTrashed?: boolean } = {}): Credential[] {
  const includeTrashed = options.includeTrashed ?? false;
  return session.vault
    .listIndex()
    .filter((entry) => entry.recordType === 'credential')
    .map((entry) => getCredential(session, entry.id))
    .filter((c): c is Credential => c !== undefined && (includeTrashed || c.deletedAt === null));
}
