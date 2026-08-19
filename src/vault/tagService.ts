import { randomUUID } from '../crypto/csprng';
import { UnlockSession } from '../unlock/session';
import { Credential, Tag } from '../storage/schema';
import { listCredentials } from './credentialService';

export function createTag(session: UnlockSession, name: string, color: string): Tag {
  const tag: Tag = { id: randomUUID(), recordType: 'tag', name, color };
  session.vault.putRecord(tag);
  return tag;
}

export function getTag(session: UnlockSession, id: string): Tag | undefined {
  const record = session.vault.getRecord(id);
  return record?.recordType === 'tag' ? record : undefined;
}

export function listTags(session: UnlockSession): Tag[] {
  return session.vault
    .listIndex()
    .filter((entry) => entry.recordType === 'tag')
    .map((entry) => getTag(session, entry.id))
    .filter((t): t is Tag => t !== undefined);
}

/**
 * Renaming needs no cascade: credentials reference a tag by id
 * (Credential.tagIds), not by name, so every reference reflects the new
 * name automatically as soon as the Tag record itself is updated.
 */
export function renameTag(session: UnlockSession, id: string, name: string): Tag {
  const existing = getTag(session, id);
  if (!existing) throw new Error(`No tag with id ${id}`);
  const updated: Tag = { ...existing, name };
  session.vault.putRecord(updated);
  return updated;
}

export function updateTagColor(session: UnlockSession, id: string, color: string): Tag {
  const existing = getTag(session, id);
  if (!existing) throw new Error(`No tag with id ${id}`);
  const updated: Tag = { ...existing, color };
  session.vault.putRecord(updated);
  return updated;
}

/**
 * Deletes the tag and, unlike rename, *does* need a cascade: every
 * credential holds its own copy of the tag id in tagIds, so each one
 * referencing this tag needs that id removed to avoid a dangling
 * reference. Cheap in practice — tag fan-out is small for a personal
 * password manager, and this only touches credentials that actually
 * reference the tag.
 */
export function deleteTag(session: UnlockSession, id: string): void {
  const affected = listCredentials(session, { includeTrashed: true }).filter((c) => c.tagIds.includes(id));
  for (const credential of affected) {
    session.vault.putRecord({
      ...credential,
      tagIds: credential.tagIds.filter((tagId) => tagId !== id),
      updatedAt: Date.now(),
    });
  }
  session.vault.deleteRecord(id);
}

export type TagFilterMode = 'AND' | 'OR';

/**
 * AND: every listed tag must be present on the credential.
 * OR: at least one of the listed tags must be present.
 * An empty `tagIds` list returns every (non-trashed) credential.
 */
export function filterCredentialsByTags(session: UnlockSession, tagIds: string[], mode: TagFilterMode): Credential[] {
  if (tagIds.length === 0) return listCredentials(session);

  return listCredentials(session).filter((credential) =>
    mode === 'AND'
      ? tagIds.every((tagId) => credential.tagIds.includes(tagId))
      : tagIds.some((tagId) => credential.tagIds.includes(tagId))
  );
}
