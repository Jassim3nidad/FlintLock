import { Buffer } from 'buffer';
import { configureTestPlatform, resetPlatformForTests } from '../../testing/configureTestPlatform';
import { VaultStore } from '../../storage/vaultStore';
import { UnlockSession } from '../../unlock/session';
import { Credential } from '../../storage/schema';
import { createCredential, softDeleteCredential } from '../credentialService';
import { createTotpEntryManually } from '../totpService';
import {
  analyzeSecurity,
  estimatePasswordEntropyBits,
  OLD_PASSWORD_THRESHOLD_DAYS,
  WEAK_PASSWORD_ENTROPY_THRESHOLD_BITS,
} from '../securityDashboard';

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
  configureTestPlatform();
});

afterEach(() => {
  while (openSessions.length > 0) openSessions.pop()!.lock();
  resetPlatformForTests();
});

describe('estimatePasswordEntropyBits', () => {
  it('matches length * log2(charsetSize) for a known charset combination', () => {
    // lowercase only, 8 chars: 26-symbol charset
    expect(estimatePasswordEntropyBits('abcdefgh')).toBeCloseTo(8 * Math.log2(26), 10);
  });

  it('a longer, more diverse password scores higher than a short simple one', () => {
    const weak = estimatePasswordEntropyBits('abc123');
    const strong = estimatePasswordEntropyBits('Tr0ub4dor&9Zq!mK');
    expect(strong).toBeGreaterThan(weak);
  });

  it('empty string is zero', () => {
    expect(estimatePasswordEntropyBits('')).toBe(0);
  });
});

describe('analyzeSecurity — weak passwords', () => {
  it('flags a password below the entropy threshold and not one above it', async () => {
    const session = await newSession();
    const weak = await createCredential(session, { ...BASE_INPUT, title: 'Weak', username: 'a', password: 'abc123' });
    const strong = await createCredential(session, {
      ...BASE_INPUT,
      title: 'Strong',
      username: 'b',
      password: 'Xk9#mQ2$vL7pR4nW',
    });

    const report = await analyzeSecurity(session);
    const flaggedIds = report.weakPasswords.map((f) => f.credentialId);
    expect(flaggedIds).toContain(weak.id);
    expect(flaggedIds).not.toContain(strong.id);
    expect(report.weakPasswords.find((f) => f.credentialId === weak.id)!.estimatedEntropyBits).toBeLessThan(
      WEAK_PASSWORD_ENTROPY_THRESHOLD_BITS
    );
  });
});

describe('analyzeSecurity — reused passwords', () => {
  it('groups credentials sharing an identical password and ignores unique ones', async () => {
    const session = await newSession();
    const a = await createCredential(session, { ...BASE_INPUT, title: 'A', username: 'a', password: 'shared-pw-123' });
    const b = await createCredential(session, { ...BASE_INPUT, title: 'B', username: 'b', password: 'shared-pw-123' });
    await createCredential(session, { ...BASE_INPUT, title: 'C', username: 'c', password: 'unique-pw-456' });

    const report = await analyzeSecurity(session);
    expect(report.reusedPasswords).toHaveLength(1);
    expect(report.reusedPasswords[0]!.credentialIds.sort()).toEqual([a.id, b.id].sort());
  });
});

describe('analyzeSecurity — old passwords', () => {
  it('flags a password older than the retention threshold and not a recent one', async () => {
    const session = await newSession();
    const old = await createCredential(session, { ...BASE_INPUT, title: 'Old', username: 'a', password: 'x' });
    const recent = await createCredential(session, { ...BASE_INPUT, title: 'Recent', username: 'b', password: 'y' });

    // Backdate `old`'s passwordUpdatedAt directly in storage, same
    // pattern as the trash-purge test.
    const stalePasswordUpdatedAt = Date.now() - (OLD_PASSWORD_THRESHOLD_DAYS + 1) * 24 * 60 * 60 * 1000;
    await session.vault.putRecord({
      ...((await session.vault.getRecord(old.id)) as Credential),
      passwordUpdatedAt: stalePasswordUpdatedAt,
    });

    const report = await analyzeSecurity(session);
    const flaggedIds = report.oldPasswords.map((f) => f.credentialId);
    expect(flaggedIds).toContain(old.id);
    expect(flaggedIds).not.toContain(recent.id);
  });
});

describe('analyzeSecurity — missing two-factor', () => {
  it('flags a credential with no attached TOTP entry and not one that has one', async () => {
    const session = await newSession();
    const withTotp = await createCredential(session, { ...BASE_INPUT, title: 'HasTOTP', username: 'a', password: 'x' });
    const withoutTotp = await createCredential(session, { ...BASE_INPUT, title: 'NoTOTP', username: 'b', password: 'y' });

    await createTotpEntryManually(session, {
      credentialId: withTotp.id,
      issuer: '',
      account: 'a',
      secret: 'JBSWY3DPEHPK3PXP',
      algorithm: 'SHA1',
      digits: 6,
      mode: 'totp',
      period: 30,
      counter: null,
    });

    const report = await analyzeSecurity(session);
    const flaggedIds = report.missingTwoFactor.map((f) => f.credentialId);
    expect(flaggedIds).not.toContain(withTotp.id);
    expect(flaggedIds).toContain(withoutTotp.id);
  });
});

describe('analyzeSecurity — trashed credentials are excluded entirely', () => {
  it('does not surface a soft-deleted credential in any finding category', async () => {
    const session = await newSession();
    const trashed = await createCredential(session, { ...BASE_INPUT, title: 'Gone', username: 'a', password: 'abc123' });
    await softDeleteCredential(session, trashed.id);

    const report = await analyzeSecurity(session);
    expect(report.weakPasswords.some((f) => f.credentialId === trashed.id)).toBe(false);
    expect(report.missingTwoFactor.some((f) => f.credentialId === trashed.id)).toBe(false);
  });
});
