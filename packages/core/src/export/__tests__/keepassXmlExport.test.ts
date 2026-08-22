import { Buffer } from 'buffer';
import { configureTestPlatform, resetPlatformForTests } from '../../testing/configureTestPlatform';
import { VaultStore } from '../../storage/vaultStore';
import { UnlockSession } from '../../unlock/session';
import { createCredential } from '../../vault/credentialService';
import { createTag } from '../../vault/tagService';
import { exportKeePassXml } from '../keepassXmlExport';

const FAST_KDF = { kdf: 'pbkdf2' as const, iterations: 100, digest: 'sha256' as const };
const PASSWORD = Buffer.from('pw');
const openSessions: UnlockSession[] = [];

const BASE_INPUT = {
  urls: [] as string[],
  notes: '',
  tagIds: [] as string[],
  customFields: [] as { key: string; value: string; type: 'text' | 'hidden' | 'url' | 'number' | 'date' }[],
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

describe('exportKeePassXml', () => {
  it('requires acknowledgeRisk: true', async () => {
    const session = await newSession();
    await expect(exportKeePassXml(session, { acknowledgeRisk: false as unknown as true })).rejects.toThrow(/acknowledgeRisk/);
  });

  it('produces a well-formed KeePassFile skeleton with the standard fields', async () => {
    const session = await newSession();
    await createCredential(session, { ...BASE_INPUT, title: 'Example', username: 'alice', password: 'hunter2', urls: ['https://example.com'] });

    const xml = await exportKeePassXml(session, { acknowledgeRisk: true });
    expect(xml).toContain('<KeePassFile>');
    expect(xml).toContain('</KeePassFile>');
    expect(xml).toContain('<Key>Title</Key>');
    expect(xml).toContain('<Value>Example</Value>');
    expect(xml).toContain('<Key>UserName</Key>');
    expect(xml).toContain('<Value>alice</Value>');
    expect(xml).toContain('<Key>URL</Key>');
    expect(xml).toContain('<Value>https://example.com</Value>');
  });

  it('marks the Password field Protected', async () => {
    const session = await newSession();
    await createCredential(session, { ...BASE_INPUT, title: 'X', username: 'a', password: 'hunter2' });
    const xml = await exportKeePassXml(session, { acknowledgeRisk: true });
    expect(xml).toContain('<Value Protected="True">hunter2</Value>');
  });

  it('marks a hidden-typed custom field Protected, but not a plain text one', async () => {
    const session = await newSession();
    await createCredential(session, {
      ...BASE_INPUT,
      title: 'X',
      username: 'a',
      password: 'p',
      customFields: [
        { key: 'PIN', value: '1234', type: 'hidden' },
        { key: 'Note', value: 'visible', type: 'text' },
      ],
    });

    const xml = await exportKeePassXml(session, { acknowledgeRisk: true });
    expect(xml).toContain('<Value Protected="True">1234</Value>');
    expect(xml).toContain('<Value>visible</Value>');
  });

  it('escapes XML special characters', async () => {
    const session = await newSession();
    await createCredential(session, {
      ...BASE_INPUT,
      title: 'A & B <script>"quote\'apos</script>',
      username: 'a',
      password: 'p',
    });

    const xml = await exportKeePassXml(session, { acknowledgeRisk: true });
    expect(xml).toContain('A &amp; B &lt;script&gt;&quot;quote&apos;apos&lt;/script&gt;');
    expect(xml).not.toContain('<script>');
  });

  it('includes tag names as a semicolon-joined Tags element', async () => {
    const session = await newSession();
    const t1 = await createTag(session, 'Work', '#111');
    const t2 = await createTag(session, 'Bank', '#222');
    await createCredential(session, { ...BASE_INPUT, title: 'X', username: 'a', password: 'p', tagIds: [t1.id, t2.id] });

    const xml = await exportKeePassXml(session, { acknowledgeRisk: true });
    expect(xml).toContain('<Tags>Work;Bank</Tags>');
  });

  it('omits the Tags element entirely for a credential with no tags', async () => {
    const session = await newSession();
    await createCredential(session, { ...BASE_INPUT, title: 'X', username: 'a', password: 'p' });
    const xml = await exportKeePassXml(session, { acknowledgeRisk: true });
    expect(xml).not.toContain('<Tags>');
  });
});
