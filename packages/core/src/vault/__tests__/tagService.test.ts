import { Buffer } from 'buffer';
import { configureTestPlatform, resetPlatformForTests } from '../../testing/configureTestPlatform';
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
  configureTestPlatform();
});

afterEach(() => {
  while (openSessions.length > 0) openSessions.pop()!.lock();
  resetPlatformForTests();
});

describe('createTag / getTag / listTags', () => {
  it('round-trips a tag', async () => {
    const session = await newSession();
    const tag = await createTag(session, 'Work', '#336699');
    expect(await getTag(session, tag.id)).toEqual(tag);
    expect(await listTags(session)).toEqual([tag]);
  });
});

describe('renameTag — no cascade needed', () => {
  it('updates the tag record; credentials referencing it by id see the new name with no update of their own', async () => {
    const session = await newSession();
    const tag = await createTag(session, 'Work', '#336699');
    const credential = await createCredential(session, { ...BASE_CREDENTIAL_INPUT, tagIds: [tag.id] });

    const renamed = await renameTag(session, tag.id, 'Personal');
    expect(renamed.name).toBe('Personal');

    // The credential's own record is untouched — its tagIds still just
    // holds the id, and resolving that id now finds the renamed tag.
    const stillReferencing = (await getCredential(session, credential.id))!;
    expect(stillReferencing.tagIds).toEqual([tag.id]);
    expect((await getTag(session, stillReferencing.tagIds[0]!))!.name).toBe('Personal');
  });
});

describe('updateTagColor', () => {
  it('updates only the color', async () => {
    const session = await newSession();
    const tag = await createTag(session, 'Work', '#336699');
    const updated = await updateTagColor(session, tag.id, '#ff0000');
    expect(updated.name).toBe('Work');
    expect(updated.color).toBe('#ff0000');
  });
});

describe('deleteTag — cascades to remove the id from every referencing credential', () => {
  it('removes the tag and strips its id from all credentials that referenced it', async () => {
    const session = await newSession();
    const tag = await createTag(session, 'Work', '#336699');
    const other = await createTag(session, 'Personal', '#00ff00');
    const a = await createCredential(session, { ...BASE_CREDENTIAL_INPUT, tagIds: [tag.id, other.id] });
    const b = await createCredential(session, { ...BASE_CREDENTIAL_INPUT, tagIds: [tag.id] });
    const c = await createCredential(session, { ...BASE_CREDENTIAL_INPUT, tagIds: [other.id] }); // unaffected

    await deleteTag(session, tag.id);

    expect(await getTag(session, tag.id)).toBeUndefined();
    expect((await getCredential(session, a.id))!.tagIds).toEqual([other.id]);
    expect((await getCredential(session, b.id))!.tagIds).toEqual([]);
    expect((await getCredential(session, c.id))!.tagIds).toEqual([other.id]);
  });
});

describe('filterCredentialsByTags', () => {
  it('empty tagIds returns every credential', async () => {
    const session = await newSession();
    await createCredential(session, { ...BASE_CREDENTIAL_INPUT, tagIds: [] });
    await createCredential(session, { ...BASE_CREDENTIAL_INPUT, tagIds: [] });
    expect(await filterCredentialsByTags(session, [], 'AND')).toHaveLength(2);
  });

  it('OR mode matches any of the given tags', async () => {
    const session = await newSession();
    const t1 = await createTag(session, 'Work', '#111');
    const t2 = await createTag(session, 'Bank', '#222');
    const a = await createCredential(session, { ...BASE_CREDENTIAL_INPUT, title: 'A', tagIds: [t1.id] });
    const b = await createCredential(session, { ...BASE_CREDENTIAL_INPUT, title: 'B', tagIds: [t2.id] });
    await createCredential(session, { ...BASE_CREDENTIAL_INPUT, title: 'C', tagIds: [] });

    const results = await filterCredentialsByTags(session, [t1.id, t2.id], 'OR');
    expect(results.map((c) => c.id).sort()).toEqual([a.id, b.id].sort());
  });

  it('AND mode requires every given tag to be present', async () => {
    const session = await newSession();
    const t1 = await createTag(session, 'Work', '#111');
    const t2 = await createTag(session, 'Bank', '#222');
    const both = await createCredential(session, { ...BASE_CREDENTIAL_INPUT, title: 'Both', tagIds: [t1.id, t2.id] });
    await createCredential(session, { ...BASE_CREDENTIAL_INPUT, title: 'OnlyWork', tagIds: [t1.id] });

    const results = await filterCredentialsByTags(session, [t1.id, t2.id], 'AND');
    expect(results.map((c) => c.id)).toEqual([both.id]);
  });
});
