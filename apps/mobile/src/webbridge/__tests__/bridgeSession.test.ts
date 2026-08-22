jest.mock('../../crypto/native');
jest.mock('../../storage/native');
jest.mock('../../biometric/native');
jest.mock('../../clipboard/native');

import { resetPlatformForTests } from '@flintlock/core';
import { fromKeyHandle } from '../../crypto/keyHandleInterop';
import { configureNativeTestPlatform } from '../../testUtils/configureNativePlatform';
import { BridgeSession } from '../bridgeSession';

beforeEach(() => {
  configureNativeTestPlatform();
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
  resetPlatformForTests();
});

function connectedSession(ttlMs?: number): BridgeSession {
  const session = ttlMs !== undefined ? BridgeSession.create(ttlMs) : BridgeSession.create();
  session.markConnected();
  return session;
}

describe('BridgeSession — lifecycle happy path', () => {
  it('starts pending, with a valid qrPayload', () => {
    const session = BridgeSession.create();
    expect(session.getState()).toBe('pending');
    const qr = session.qrPayload('192.168.1.42', 8443);
    expect(qr.ip).toBe('192.168.1.42');
    expect(qr.sessionId).toBe(session.sessionId);
    expect(qr.secret).toBeTruthy();
  });

  it('walks pending -> connected -> awaiting-consent -> transferring -> completed', () => {
    const session = BridgeSession.create();
    session.markConnected();
    expect(session.getState()).toBe('connected');

    session.requestTransfer('Password for example.com');
    expect(session.getState()).toBe('awaiting-consent');
    expect(session.getPendingRequest()).toEqual({ description: 'Password for example.com' });

    session.approveTransfer();
    expect(session.getState()).toBe('transferring');

    session.complete();
    expect(session.getState()).toBe('completed');
  });

  it('denyTransfer returns to connected and clears the pending request, without tearing down', () => {
    const session = connectedSession();
    session.requestTransfer('Password for example.com');
    session.denyTransfer();
    expect(session.getState()).toBe('connected');
    expect(session.getPendingRequest()).toBeNull();
    // Session is still usable — a second request can follow.
    session.requestTransfer('A different item');
    expect(session.getState()).toBe('awaiting-consent');
  });
});

describe('BridgeSession — illegal transitions throw', () => {
  it('requestTransfer before connected throws', () => {
    const session = BridgeSession.create();
    expect(() => session.requestTransfer('x')).toThrow(/expected state 'connected'/);
  });

  it('approveTransfer without a pending request throws', () => {
    const session = connectedSession();
    expect(() => session.approveTransfer()).toThrow(/expected state 'awaiting-consent'/);
  });

  it('markConnected twice throws', () => {
    const session = connectedSession();
    expect(() => session.markConnected()).toThrow(/expected state 'pending'/);
  });
});

describe('BridgeSession — single-use', () => {
  it('rejects any further request after completion', () => {
    const session = connectedSession();
    session.requestTransfer('x');
    session.approveTransfer();
    session.complete();

    expect(() => session.requestTransfer('y')).toThrow();
    expect(() => session.qrPayload('192.168.1.1', 1)).toThrow(/torn down/);
  });

  it('zeroes the session key and pairing secret on completion', async () => {
    const session = connectedSession();
    const key = await session.sessionKey();
    session.requestTransfer('x');
    session.approveTransfer();
    session.complete();

    // The same underlying bytes returned earlier are now zeroed in place
    // — this is the actual memory-hygiene guarantee, not just "can't
    // fetch a new one".
    expect(fromKeyHandle(key).every((byte: number) => byte === 0)).toBe(true);
  });
});

describe('BridgeSession — timeout', () => {
  it('expires and tears down if the TTL elapses before completion', () => {
    const session = BridgeSession.create(60_000);
    const reasons: string[] = [];
    session.onTeardown((r) => reasons.push(r));

    jest.advanceTimersByTime(60_000);

    expect(session.getState()).toBe('expired');
    expect(reasons).toEqual(['timeout']);
    expect(() => session.qrPayload('x', 1)).toThrow(/torn down/);
  });

  it('does not expire before the TTL elapses', () => {
    const session = BridgeSession.create(60_000);
    jest.advanceTimersByTime(59_999);
    expect(session.getState()).toBe('pending');
  });

  it('a completed session does not later fire a timeout teardown too', () => {
    const session = connectedSession(60_000);
    const reasons: string[] = [];
    session.onTeardown((r) => reasons.push(r));

    session.requestTransfer('x');
    session.approveTransfer();
    session.complete();

    jest.advanceTimersByTime(60_000);
    expect(reasons).toEqual(['completed']);
  });
});

describe('BridgeSession — cancel and backgrounding', () => {
  it('cancel() tears down and is idempotent', () => {
    const session = connectedSession();
    const reasons: string[] = [];
    session.onTeardown((r) => reasons.push(r));

    session.cancel();
    session.cancel(); // no-op, no second teardown notification
    expect(session.getState()).toBe('cancelled');
    expect(reasons).toEqual(['cancelled']);
  });

  it('handleAppBackgrounded() always tears down — not configurable, unlike vault auto-lock', () => {
    const session = connectedSession();
    const reasons: string[] = [];
    session.onTeardown((r) => reasons.push(r));

    session.handleAppBackgrounded();
    expect(session.getState()).toBe('cancelled');
    expect(reasons).toEqual(['backgrounded']);
  });

  it('backgrounding a terminal session is a no-op', () => {
    const session = connectedSession();
    session.cancel();
    const reasons: string[] = [];
    session.onTeardown((r) => reasons.push(r));
    session.handleAppBackgrounded();
    expect(reasons).toEqual([]);
  });
});

describe('BridgeSession — onTeardown unsubscribe', () => {
  it('stops notifications after unsubscribing', () => {
    const session = connectedSession();
    const reasons: string[] = [];
    const unsubscribe = session.onTeardown((r) => reasons.push(r));
    unsubscribe();
    session.cancel();
    expect(reasons).toEqual([]);
  });
});

describe('BridgeSession — sessionKey', () => {
  it('is deterministic within one session and derived lazily', async () => {
    const session = connectedSession();
    const a = await session.sessionKey();
    const b = await session.sessionKey();
    expect(fromKeyHandle(a).equals(fromKeyHandle(b))).toBe(true);
  });

  it('differs between two different sessions', async () => {
    const a = await connectedSession().sessionKey();
    const b = await connectedSession().sessionKey();
    expect(fromKeyHandle(a).equals(fromKeyHandle(b))).toBe(false);
  });
});
