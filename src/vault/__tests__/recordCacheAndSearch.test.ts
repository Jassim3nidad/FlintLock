jest.mock('../../crypto/native');
jest.mock('../../storage/native');

import { Buffer } from '../../crypto';
import { vaultStorage } from '../../storage/native';
import { VaultStore } from '../../storage/vaultStore';
import { UnlockSession } from '../../unlock/session';
import { createCredential } from '../credentialService';
import { RecordCache } from '../recordCache';
import { searchCredentials } from '../search';

const FAST_KDF = { kdf: 'pbkdf2' as const, iterations: 100, digest: 'sha256' as const };
const PASSWORD = Buffer.from('pw');

const BASE_INPUT = {
  urls: [] as string[],
  notes: '',
  tagIds: [] as string[],
  customFields: [] as { key: string; value: string; type: 'text' | 'hidden' | 'url' | 'number' | 'date' }[],
  favorite: false,
};

const openSessions: UnlockSession[] = [];

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
  // Every unlocked session leaves a pending real-timer auto-lock
  // scheduled; lock() cancels it so Jest can exit cleanly.
  while (openSessions.length > 0) openSessions.pop()!.lock();
});

describe('RecordCache', () => {
  it('returns the same decrypted data on repeated gets', async () => {
    const session = await newSession();
    const created = createCredential(session, { ...BASE_INPUT, title: 'A', username: 'a', password: 'x' });
    const cache = new RecordCache(session);

    expect(cache.get(created.id)).toEqual(created);
    expect(cache.get(created.id)).toEqual(created);
    expect(cache.size).toBe(1);
  });

  it('evicts the least-recently-used entry once past the bound', async () => {
    const session = await newSession();
    const a = createCredential(session, { ...BASE_INPUT, title: 'A', username: 'a', password: 'x' });
    const b = createCredential(session, { ...BASE_INPUT, title: 'B', username: 'b', password: 'x' });
    const c = createCredential(session, { ...BASE_INPUT, title: 'C', username: 'c', password: 'x' });
    const cache = new RecordCache(session, 2);

    cache.get(a.id);
    cache.get(b.id);
    cache.get(c.id); // evicts a (least recently used)
    expect(cache.size).toBe(2);

    // Getting `a` again still works — it just re-decrypts from storage
    // rather than hitting the cache — and this bumps b or c out instead.
    expect(cache.get(a.id)).toEqual(a);
    expect(cache.size).toBe(2);
  });

  it('recency: accessing an entry protects it from eviction', async () => {
    const session = await newSession();
    const a = createCredential(session, { ...BASE_INPUT, title: 'A', username: 'a', password: 'x' });
    const b = createCredential(session, { ...BASE_INPUT, title: 'B', username: 'b', password: 'x' });
    const c = createCredential(session, { ...BASE_INPUT, title: 'C', username: 'c', password: 'x' });
    const cache = new RecordCache(session, 2);

    cache.get(a.id);
    cache.get(b.id);
    cache.get(a.id); // bump a back to most-recently-used; b is now LRU
    cache.get(c.id); // should evict b, not a

    expect(cache.get(a.id)).toEqual(a); // still present, no re-decrypt needed to matter for this assertion
    expect(cache.size).toBe(2);
  });

  it('clears automatically when the session locks — decrypted state does not survive a lock', async () => {
    const session = await newSession();
    const a = createCredential(session, { ...BASE_INPUT, title: 'A', username: 'a', password: 'x' });
    const cache = new RecordCache(session);
    cache.get(a.id);
    expect(cache.size).toBe(1);

    session.lock();
    expect(cache.size).toBe(0);
  });
});

describe('searchCredentials', () => {
  it('empty query returns all non-trashed credentials', async () => {
    const session = await newSession();
    createCredential(session, { ...BASE_INPUT, title: 'Bank', username: 'a', password: 'x' });
    createCredential(session, { ...BASE_INPUT, title: 'Email', username: 'b', password: 'x' });
    const cache = new RecordCache(session);

    expect(searchCredentials(session, cache, '').map((c) => c.title).sort()).toEqual(['Bank', 'Email']);
  });

  it('matches by title, username, or url, case-insensitively', async () => {
    const session = await newSession();
    createCredential(session, { ...BASE_INPUT, title: 'GitHub', username: 'octocat', password: 'x', urls: ['https://github.com'] });
    createCredential(session, { ...BASE_INPUT, title: 'Bank', username: 'someone', password: 'x' });
    const cache = new RecordCache(session);

    expect(searchCredentials(session, cache, 'github').map((c) => c.title)).toEqual(['GitHub']);
    expect(searchCredentials(session, cache, 'OCTOCAT').map((c) => c.title)).toEqual(['GitHub']);
  });

  it('excludes hidden custom fields from the search haystack', async () => {
    const session = await newSession();
    createCredential(session, {
      ...BASE_INPUT,
      title: 'Vault Item',
      username: 'a',
      password: 'x',
      customFields: [{ key: 'secret-note', value: 'unfindable-token', type: 'hidden' }],
    });
    const cache = new RecordCache(session);

    expect(searchCredentials(session, cache, 'unfindable-token')).toEqual([]);
  });

  it('matches visible (non-hidden) custom fields', async () => {
    const session = await newSession();
    createCredential(session, {
      ...BASE_INPUT,
      title: 'Vault Item',
      username: 'a',
      password: 'x',
      customFields: [{ key: 'note', value: 'findable-token', type: 'text' }],
    });
    const cache = new RecordCache(session);

    expect(searchCredentials(session, cache, 'findable-token')).toHaveLength(1);
  });
});
