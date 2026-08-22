import { Buffer } from 'buffer';
import { dekWrapAad, unwrapKey } from '../../crypto/envelope';
import { deriveKek } from '../../crypto/kdf';
import { configureTestPlatform, resetPlatformForTests } from '../../testing/configureTestPlatform';
import { SecureStore } from '../../storage/SecureStore';
import { VaultHeader } from '../../storage/schema';
import { VaultStore } from '../../storage/vaultStore';
import { UnlockSession } from '../session';

const FAST_KDF = { kdf: 'pbkdf2' as const, iterations: 100, digest: 'sha256' as const };
const PASSWORD = Buffer.from('correct horse battery staple');

let secureStore: SecureStore;

beforeEach(() => {
  ({ secureStore } = configureTestPlatform());
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
  resetPlatformForTests();
});

async function createVaultWithAutoLock(autoLock: '30s' | 'never' | 'immediate'): Promise<void> {
  const store = await VaultStore.create(PASSWORD, FAST_KDF);
  await store.updateSettings({ autoLock });
}

describe('UnlockSession — auto-lock timer', () => {
  it('locks after the configured idle delay, wiping the DEK', async () => {
    await createVaultWithAutoLock('30s');
    const session = new UnlockSession();
    await session.unlockWithPassword(PASSWORD);
    expect(session.isUnlocked).toBe(true);

    jest.advanceTimersByTime(30_000);
    expect(session.isUnlocked).toBe(false);
    expect(() => session.vault).toThrow(/locked/i);
  });

  it('does not lock before the delay elapses', async () => {
    await createVaultWithAutoLock('30s');
    const session = new UnlockSession();
    await session.unlockWithPassword(PASSWORD);

    jest.advanceTimersByTime(29_999);
    expect(session.isUnlocked).toBe(true);
  });

  it('never auto-locks when the setting is "never"', async () => {
    await createVaultWithAutoLock('never');
    const session = new UnlockSession();
    await session.unlockWithPassword(PASSWORD);

    jest.advanceTimersByTime(1000 * 60 * 60 * 24);
    expect(session.isUnlocked).toBe(true);
  });

  it('recordActivity() resets the idle timer', async () => {
    await createVaultWithAutoLock('30s');
    const session = new UnlockSession();
    await session.unlockWithPassword(PASSWORD);

    jest.advanceTimersByTime(20_000);
    session.recordActivity();
    jest.advanceTimersByTime(20_000); // 40s total, but only 20s since last activity
    expect(session.isUnlocked).toBe(true);

    jest.advanceTimersByTime(10_000); // 30s since last activity
    expect(session.isUnlocked).toBe(false);
  });

  it('"immediate" locks on the very next tick', async () => {
    await createVaultWithAutoLock('immediate');
    const session = new UnlockSession();
    await session.unlockWithPassword(PASSWORD);

    jest.advanceTimersByTime(0);
    expect(session.isUnlocked).toBe(false);
  });
});

describe('UnlockSession — app lifecycle', () => {
  it('locks on backgrounding when lockOnBackground is enabled', async () => {
    const store = await VaultStore.create(PASSWORD, FAST_KDF);
    await store.updateSettings({ autoLock: 'never', lockOnBackground: true });
    const session = new UnlockSession();
    await session.unlockWithPassword(PASSWORD);

    session.handleAppBackgrounded();
    expect(session.isUnlocked).toBe(false);
  });

  it('does not lock on backgrounding when lockOnBackground is disabled', async () => {
    const store = await VaultStore.create(PASSWORD, FAST_KDF);
    await store.updateSettings({ autoLock: 'never', lockOnBackground: false });
    const session = new UnlockSession();
    await session.unlockWithPassword(PASSWORD);

    session.handleAppBackgrounded();
    expect(session.isUnlocked).toBe(true);
  });

  it('always locks on a device-lock event, regardless of settings', async () => {
    const store = await VaultStore.create(PASSWORD, FAST_KDF);
    await store.updateSettings({ autoLock: 'never', lockOnBackground: false });
    const session = new UnlockSession();
    await session.unlockWithPassword(PASSWORD);

    session.handleDeviceLocked();
    expect(session.isUnlocked).toBe(false);
  });

  it('foregrounding restarts the idle timer', async () => {
    await createVaultWithAutoLock('30s');
    const session = new UnlockSession();
    await session.unlockWithPassword(PASSWORD);

    jest.advanceTimersByTime(25_000);
    session.handleAppForegrounded();
    jest.advanceTimersByTime(25_000); // 50s total, 25s since foregrounding
    expect(session.isUnlocked).toBe(true);
  });
});

describe('UnlockSession — manual lock and listeners', () => {
  it('lock() is idempotent and only notifies listeners once per actual unlock->lock transition', async () => {
    await createVaultWithAutoLock('never');
    const session = new UnlockSession();
    await session.unlockWithPassword(PASSWORD);

    const reasons: string[] = [];
    session.onLock((reason) => reasons.push(reason));

    session.lock();
    session.lock(); // already locked — should not notify again
    expect(reasons).toEqual(['manual']);
  });

  it('unsubscribe stops further notifications', async () => {
    await createVaultWithAutoLock('never');
    const session = new UnlockSession();
    await session.unlockWithPassword(PASSWORD);

    const reasons: string[] = [];
    const unsubscribe = session.onLock((reason) => reasons.push(reason));
    unsubscribe();
    session.lock();
    expect(reasons).toEqual([]);
  });

  it('manual lock() cancels the pending idle timer (no delayed double-fire)', async () => {
    await createVaultWithAutoLock('30s');
    const session = new UnlockSession();
    await session.unlockWithPassword(PASSWORD);

    const reasons: string[] = [];
    session.onLock((reason) => reasons.push(reason));

    session.lock();
    jest.advanceTimersByTime(30_000);
    expect(reasons).toEqual(['manual']);
  });
});

describe('UnlockSession — biometric path (unlockWithDek)', () => {
  it('unlocks with a directly-supplied DEK and still schedules the idle timer', async () => {
    await createVaultWithAutoLock('30s');

    // Recover the DEK independently through the crypto layer, standing in
    // for what packages/core/src/biometric's platform implementation
    // would hand back after a successful biometric prompt.
    const header = JSON.parse((await secureStore.getItem('vault:header'))!.toString('utf8')) as VaultHeader;
    const kek = await deriveKek(PASSWORD, header.kdf, Buffer.from(header.salt, 'base64'));
    const dek = await unwrapKey(
      {
        iv: Buffer.from(header.wrappedDek.iv, 'base64'),
        ciphertext: Buffer.from(header.wrappedDek.ciphertext, 'base64'),
        authTag: Buffer.from(header.wrappedDek.authTag, 'base64'),
      },
      kek,
      dekWrapAad(header.vaultId, header.kdfParamsVersion)
    );

    const session = new UnlockSession();
    await session.unlockWithDek(dek);
    expect(session.isUnlocked).toBe(true);

    jest.advanceTimersByTime(30_000);
    expect(session.isUnlocked).toBe(false);
  });
});
