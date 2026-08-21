jest.mock('../../crypto/native');
jest.mock('../../storage/native');

import { Buffer } from '../../crypto';
import { vaultStorage } from '../../storage/native';
import { VaultStore } from '../../storage/vaultStore';
import { UnlockSession } from '../../unlock/session';
import { createCredential, getCredential } from '../credentialService';
import { createTag, deleteTag, filterCredentialsByTags, getTag, listTags, renameTag, updateTagColor } from '../tagService';

const FAST_KDF = { kdf: 'pbkdf2' as const, iterations: 100, digest: 'sha256' as const };
const PASSWORD = Buffer.from('pw');
const openSessions: UnlockSession[] = [];

const BASE_CREDENTIAL_INPUT = {
  title: 'X',
  username: 'x',
  password: 'x',
  urls: [] as string[],
  notes: '',
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

describe('createTag / getTag / listTags', () => {
  it('round-trips a tag', async () => {
    const session = await newSession();
    const tag = createTag(session, 'Work', '#336699');
    expect(getTag(session, tag.id)).toEqual(tag);
    expect(listTags(session)).toEqual([tag]);
  });
});

describe('renameTag — no cascade needed', () => {
  it('updates the tag record; credentials referencing it by id see the new name with no update of their own', async () => {
    const session = await newSession();
    const tag = createTag(session, 'Work', '#336699');
    const credential = createCredential(session, { ...BASE_CREDENTIAL_INPUT, tagIds: [tag.id] });

    const renamed = renameTag(session, tag.id, 'Personal');
    expect(renamed.name).toBe('Personal');

    // The credential's own record is untouched — its tagIds still just
    // holds the id, and resolving that id now finds the renamed tag.
    const stillReferencing = getCredential(session, credential.id)!;
    expect(stillReferencing.tagIds).toEqual([tag.id]);
    expect(getTag(session, stillReferencing.tagIds[0]!)!.name).toBe('Personal');
  });
});

describe('updateTagColor', () => {
  it('updates only the color', async () => {
    const session = await newSession();
    const tag = createTag(session, 'Work', '#336699');
    const updated = updateTagColor(session, tag.id, '#ff0000');
    expect(updated.name).toBe('Work');
    expect(updated.color).toBe('#ff0000');
  });
});

describe('deleteTag — cascades to remove the id from every referencing credential', () => {
  it('removes the tag and strips its id from all credentials that referenced it', async () => {
    const session = await newSession();
    const tag = createTag(session, 'Work', '#336699');
    const other = createTag(session, 'Personal', '#00ff00');
    const a = createCredential(session, { ...BASE_CREDENTIAL_INPUT, tagIds: [tag.id, other.id] });
    const b = createCredential(session, { ...BASE_CREDENTIAL_INPUT, tagIds: [tag.id] });
    const c = createCredential(session, { ...BASE_CREDENTIAL_INPUT, tagIds: [other.id] }); // unaffected

    deleteTag(session, tag.id);

    expect(getTag(session, tag.id)).toBeUndefined();
    expect(getCredential(session, a.id)!.tagIds).toEqual([other.id]);
    expect(getCredential(session, b.id)!.tagIds).toEqual([]);
    expect(getCredential(session, c.id)!.tagIds).toEqual([other.id]);
  });
});

describe('filterCredentialsByTags', () => {
  it('empty tagIds returns every credential', async () => {
    const session = await newSession();
    createCredential(session, { ...BASE_CREDENTIAL_INPUT, tagIds: [] });
    createCredential(session, { ...BASE_CREDENTIAL_INPUT, tagIds: [] });
    expect(filterCredentialsByTags(session, [], 'AND')).toHaveLength(2);
  });

  it('OR mode matches any of the given tags', async () => {
    const session = await newSession();
    const t1 = createTag(session, 'Work', '#111');
    const t2 = createTag(session, 'Bank', '#222');
    const a = createCredential(session, { ...BASE_CREDENTIAL_INPUT, title: 'A', tagIds: [t1.id] });
    const b = createCredential(session, { ...BASE_CREDENTIAL_INPUT, title: 'B', tagIds: [t2.id] });
    createCredential(session, { ...BASE_CREDENTIAL_INPUT, title: 'C', tagIds: [] });

    const results = filterCredentialsByTags(session, [t1.id, t2.id], 'OR');
    expect(results.map((c) => c.id).sort()).toEqual([a.id, b.id].sort());
  });

  it('AND mode requires every given tag to be present', async () => {
    const session = await newSession();
    const t1 = createTag(session, 'Work', '#111');
    const t2 = createTag(session, 'Bank', '#222');
    const both = createCredential(session, { ...BASE_CREDENTIAL_INPUT, title: 'Both', tagIds: [t1.id, t2.id] });
    createCredential(session, { ...BASE_CREDENTIAL_INPUT, title: 'OnlyWork', tagIds: [t1.id] });

    const results = filterCredentialsByTags(session, [t1.id, t2.id], 'AND');
    expect(results.map((c) => c.id)).toEqual([both.id]);
  });
});
