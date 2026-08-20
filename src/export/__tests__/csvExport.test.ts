jest.mock('../../crypto/native');
jest.mock('../../storage/native');

import { Buffer } from '../../crypto';
import { vaultStorage } from '../../storage/native';
import { VaultStore } from '../../storage/vaultStore';
import { UnlockSession } from '../../unlock/session';
import { createCredential } from '../../vault/credentialService';
import { createTag } from '../../vault/tagService';
import { exportCsv } from '../csvExport';

const FAST_KDF = { kdf: 'pbkdf2' as const, iterations: 100, digest: 'sha256' as const };
const PASSWORD = Buffer.from('pw');
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

describe('exportCsv', () => {
  it('requires acknowledgeRisk: true', async () => {
    const session = await newSession();
    expect(() => exportCsv(session, { acknowledgeRisk: false as unknown as true })).toThrow(/acknowledgeRisk/);
  });

  it('emits a header row followed by one row per credential', async () => {
    const session = await newSession();
    createCredential(session, { ...BASE_INPUT, title: 'Example', username: 'alice', password: 'hunter2', urls: ['https://example.com'] });

    const csv = exportCsv(session, { acknowledgeRisk: true });
    const lines = csv.trim().split('\r\n');
    expect(lines[0]).toBe('title,username,password,urls,notes,tags,favorite');
    expect(lines[1]).toBe('Example,alice,hunter2,https://example.com,,,false');
  });

  it('resolves tagIds to tag names', async () => {
    const session = await newSession();
    const tag = createTag(session, 'Work', '#336699');
    createCredential(session, { ...BASE_INPUT, title: 'X', username: 'a', password: 'p', tagIds: [tag.id] });

    const csv = exportCsv(session, { acknowledgeRisk: true });
    expect(csv).toContain('Work');
  });

  it('quotes fields containing commas, quotes, or newlines', async () => {
    const session = await newSession();
    createCredential(session, {
      ...BASE_INPUT,
      title: 'Has, a comma',
      username: 'a',
      password: 'p',
      notes: 'line one\nline "two"',
    });

    const csv = exportCsv(session, { acknowledgeRisk: true });
    expect(csv).toContain('"Has, a comma"');
    expect(csv).toContain('"line one\nline ""two"""');
  });

  it('neutralizes formula-injection prefixes with a leading apostrophe', async () => {
    const session = await newSession();
    createCredential(session, { ...BASE_INPUT, title: '=cmd|"/c calc"!A1', username: '+1', password: '@evil', notes: '-1' });

    const csv = exportCsv(session, { acknowledgeRisk: true });
    const dataLine = csv.trim().split('\r\n')[1]!;
    // Title contains a comma+quote so it's CSV-quoted too, but the
    // leading apostrophe must still be present right after the opening
    // quote — i.e. formula neutralization happens before CSV quoting.
    expect(dataLine).toMatch(/^"'=cmd/);
    expect(dataLine).toContain(",'+1,");
    expect(dataLine).toContain(",'@evil,");
    expect(dataLine).toContain(",'-1,");
  });
});
