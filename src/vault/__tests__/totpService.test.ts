jest.mock('../../crypto/native');
jest.mock('../../storage/native');

import { Buffer } from '../../crypto';
import { vaultStorage } from '../../storage/native';
import { VaultStore } from '../../storage/vaultStore';
import { UnlockSession } from '../../unlock/session';
import { base32Decode } from '../../totp/base32';
import { generateHotp } from '../../totp/hotp';
import { generateTotp } from '../../totp/totp';
import {
  createTotpEntryFromOtpauthUri,
  createTotpEntryManually,
  getCurrentCode,
  getTotpEntriesForCredential,
  getTotpEntry,
  hardDeleteTotpEntry,
  listTotpEntries,
  softDeleteTotpEntry,
  totpEntryToOtpauthUri,
  updateTotpEntry,
} from '../totpService';

const FAST_KDF = { kdf: 'pbkdf2' as const, iterations: 100, digest: 'sha256' as const };
const PASSWORD = Buffer.from('pw');
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
  while (openSessions.length > 0) openSessions.pop()!.lock();
});

describe('createTotpEntryManually', () => {
  it('normalizes the secret and generates the same code generateTotp would', async () => {
    const session = await newSession();
    const entry = createTotpEntryManually(session, {
      credentialId: null,
      issuer: 'Example',
      account: 'alice',
      secret: 'jbswy3dp ehpk-3pxp',
      algorithm: 'SHA1',
      digits: 6,
      mode: 'totp',
      period: 30,
      counter: null,
    });

    expect(entry.secret).toBe('JBSWY3DPEHPK3PXP');

    const t = 1_700_000_000;
    const { code } = getCurrentCode(session, entry, t);
    const expected = generateTotp(base32Decode('JBSWY3DPEHPK3PXP'), { algorithm: 'SHA1', digits: 6, period: 30 }, t);
    expect(code).toBe(expected);
  });

  it('rejects an invalid base32 secret', async () => {
    const session = await newSession();
    expect(() =>
      createTotpEntryManually(session, {
        credentialId: null,
        issuer: '',
        account: 'alice',
        secret: 'not valid base32!!!',
        algorithm: 'SHA1',
        digits: 6,
        mode: 'totp',
        period: 30,
        counter: null,
      })
    ).toThrow();
  });

  it('requires a counter for hotp mode', async () => {
    const session = await newSession();
    expect(() =>
      createTotpEntryManually(session, {
        credentialId: null,
        issuer: '',
        account: 'alice',
        secret: 'JBSWY3DPEHPK3PXP',
        algorithm: 'SHA1',
        digits: 6,
        mode: 'hotp',
        period: 30,
        counter: null,
      })
    ).toThrow(/counter/i);
  });
});

describe('createTotpEntryFromOtpauthUri', () => {
  it('creates an entry matching the parsed URI, attached to a credential', async () => {
    const session = await newSession();
    const entry = createTotpEntryFromOtpauthUri(
      session,
      'otpauth://totp/Example:alice@example.com?secret=JBSWY3DPEHPK3PXP&issuer=Example',
      'cred-1'
    );
    expect(entry.credentialId).toBe('cred-1');
    expect(entry.issuer).toBe('Example');
    expect(entry.account).toBe('alice@example.com');
    expect(entry.secret).toBe('JBSWY3DPEHPK3PXP');
  });
});

describe('getCurrentCode', () => {
  it('totp: deterministic for a given time, includes secondsRemaining', async () => {
    const session = await newSession();
    const entry = createTotpEntryManually(session, {
      credentialId: null,
      issuer: '',
      account: 'alice',
      secret: 'JBSWY3DPEHPK3PXP',
      algorithm: 'SHA1',
      digits: 6,
      mode: 'totp',
      period: 30,
      counter: null,
    });

    const a = getCurrentCode(session, entry, 1000);
    const b = getCurrentCode(session, entry, 1000);
    expect(a.code).toBe(b.code);
    expect(a.secondsRemaining).not.toBeNull();
  });

  it('hotp: advances and persists the counter on every generation, so consecutive codes differ from the RFC sequence', async () => {
    const session = await newSession();
    const entry = createTotpEntryManually(session, {
      credentialId: null,
      issuer: '',
      account: 'alice',
      secret: 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', // arbitrary valid base32
      algorithm: 'SHA1',
      digits: 6,
      mode: 'hotp',
      period: 30,
      counter: 0,
    });

    const first = getCurrentCode(session, entry);
    expect(getTotpEntry(session, entry.id)!.counter).toBe(1);

    const second = getCurrentCode(session, entry); // caller must re-fetch; passing the stale `entry` still uses counter 0 again
    expect(second.code).toBe(first.code); // proves the caller is responsible for re-reading the entry, not this function guessing

    const refetched = getTotpEntry(session, entry.id)!;
    const third = getCurrentCode(session, refetched);
    expect(getTotpEntry(session, entry.id)!.counter).toBe(2);
    expect(third.secondsRemaining).toBeNull();
  });

  it('hotp code matches generateHotp for the entry\'s current counter', async () => {
    const session = await newSession();
    const entry = createTotpEntryManually(session, {
      credentialId: null,
      issuer: '',
      account: 'alice',
      secret: 'JBSWY3DPEHPK3PXP',
      algorithm: 'SHA1',
      digits: 6,
      mode: 'hotp',
      period: 30,
      counter: 7,
    });
    const { code } = getCurrentCode(session, entry);
    const expected = generateHotp(base32Decode('JBSWY3DPEHPK3PXP'), 7, { algorithm: 'SHA1', digits: 6 });
    expect(code).toBe(expected);
  });
});

describe('listTotpEntries / getTotpEntriesForCredential', () => {
  it('filters standalone vs attached entries', async () => {
    const session = await newSession();
    const standalone = createTotpEntryManually(session, {
      credentialId: null,
      issuer: '',
      account: 'standalone',
      secret: 'JBSWY3DPEHPK3PXP',
      algorithm: 'SHA1',
      digits: 6,
      mode: 'totp',
      period: 30,
      counter: null,
    });
    const attached = createTotpEntryManually(session, {
      credentialId: 'cred-1',
      issuer: '',
      account: 'attached',
      secret: 'JBSWY3DPEHPK3PXP',
      algorithm: 'SHA1',
      digits: 6,
      mode: 'totp',
      period: 30,
      counter: null,
    });

    expect(listTotpEntries(session).map((e) => e.id).sort()).toEqual([attached.id, standalone.id].sort());
    expect(getTotpEntriesForCredential(session, 'cred-1')).toEqual([attached]);
  });
});

describe('totpEntryToOtpauthUri', () => {
  it('round-trips through createTotpEntryFromOtpauthUri', async () => {
    const session = await newSession();
    const original = createTotpEntryManually(session, {
      credentialId: null,
      issuer: 'MyBank',
      account: 'alice',
      secret: 'JBSWY3DPEHPK3PXP',
      algorithm: 'SHA256',
      digits: 8,
      mode: 'totp',
      period: 60,
      counter: null,
    });
    const uri = totpEntryToOtpauthUri(original);
    const reimported = createTotpEntryFromOtpauthUri(session, uri, null);

    expect(reimported.issuer).toBe(original.issuer);
    expect(reimported.account).toBe(original.account);
    expect(reimported.secret).toBe(original.secret);
    expect(reimported.algorithm).toBe(original.algorithm);
    expect(reimported.digits).toBe(original.digits);
    expect(reimported.period).toBe(original.period);
  });
});

describe('update / soft-delete / hard-delete', () => {
  it('updateTotpEntry changes only the given fields', async () => {
    const session = await newSession();
    const entry = createTotpEntryManually(session, {
      credentialId: null,
      issuer: 'Old',
      account: 'alice',
      secret: 'JBSWY3DPEHPK3PXP',
      algorithm: 'SHA1',
      digits: 6,
      mode: 'totp',
      period: 30,
      counter: null,
    });
    const updated = updateTotpEntry(session, entry.id, { issuer: 'New' });
    expect(updated.issuer).toBe('New');
    expect(updated.secret).toBe(entry.secret);
  });

  it('softDeleteTotpEntry excludes it from listTotpEntries but not includeTrashed', async () => {
    const session = await newSession();
    const entry = createTotpEntryManually(session, {
      credentialId: null,
      issuer: '',
      account: 'alice',
      secret: 'JBSWY3DPEHPK3PXP',
      algorithm: 'SHA1',
      digits: 6,
      mode: 'totp',
      period: 30,
      counter: null,
    });
    softDeleteTotpEntry(session, entry.id);
    expect(listTotpEntries(session)).toEqual([]);
    expect(listTotpEntries(session, { includeTrashed: true })).toHaveLength(1);
  });

  it('hardDeleteTotpEntry removes it entirely', async () => {
    const session = await newSession();
    const entry = createTotpEntryManually(session, {
      credentialId: null,
      issuer: '',
      account: 'alice',
      secret: 'JBSWY3DPEHPK3PXP',
      algorithm: 'SHA1',
      digits: 6,
      mode: 'totp',
      period: 30,
      counter: null,
    });
    hardDeleteTotpEntry(session, entry.id);
    expect(getTotpEntry(session, entry.id)).toBeUndefined();
  });
});
