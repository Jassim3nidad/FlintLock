import { randomUUID } from '../crypto/csprng';
import { UnlockSession } from '../unlock/session';
import { Credential, Tag } from '../storage/schema';
import { listCredentials } from './credentialService';

export async function createTag(session: UnlockSession, name: string, color: string): Promise<Tag> {
  const tag: Tag = { id: randomUUID(), recordType: 'tag', name, color };
  await session.vault.putRecord(tag);
  return tag;
}

export async function getTag(session: UnlockSession, id: string): Promise<Tag | undefined> {
  const record = await session.vault.getRecord(id);
  return record?.recordType === 'tag' ? record : undefined;
}

export async function listTags(session: UnlockSession): Promise<Tag[]> {
  const index = await session.vault.listIndex();
  const tags = await Promise.all(index.filter((entry) => entry.recordType === 'tag').map((entry) => getTag(session, entry.id)));
  return tags.filter((t): t is Tag => t !== undefined);
}

/**
 * Renaming needs no cascade: credentials reference a tag by id
 * (Credential.tagIds), not by name, so every reference reflects the new
 * name automatically as soon as the Tag record itself is updated.
 */
export async function renameTag(session: UnlockSession, id: string, name: string): Promise<Tag> {
  const existing = await getTag(session, id);
  if (!existing) throw new Error(`No tag with id ${id}`);
  const updated: Tag = { ...existing, name };
  await session.vault.putRecord(updated);
  return updated;
}

export async function updateTagColor(session: UnlockSession, id: string, color: string): Promise<Tag> {
  const existing = await getTag(session, id);
  if (!existing) throw new Error(`No tag with id ${id}`);
  const updated: Tag = { ...existing, color };
  await session.vault.putRecord(updated);
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
export async function deleteTag(session: UnlockSession, id: string): Promise<void> {
  const affected = (await listCredentials(session, { includeTrashed: true })).filter((c) => c.tagIds.includes(id));
  for (const credential of affected) {
    await session.vault.putRecord({
      ...credential,
      tagIds: credential.tagIds.filter((tagId) => tagId !== id),
      updatedAt: Date.now(),
    });
  }
  await session.vault.deleteRecord(id);
}

export type TagFilterMode = 'AND' | 'OR';

/**
 * AND: every listed tag must be present on the credential.
 * OR: at least one of the listed tags must be present.
 * An empty `tagIds` list returns every (non-trashed) credential.
 */
export async function filterCredentialsByTags(session: UnlockSession, tagIds: string[], mode: TagFilterMode): Promise<Credential[]> {
  if (tagIds.length === 0) return listCredentials(session);

  const all = await listCredentials(session);
  return all.filter((credential) =>
    mode === 'AND'
      ? tagIds.every((tagId) => credential.tagIds.includes(tagId))
      : tagIds.some((tagId) => credential.tagIds.includes(tagId))
  );
}
