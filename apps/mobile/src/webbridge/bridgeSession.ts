import { Buffer, getCryptoProvider, KeyHandle, randomUUID } from '@flintlock/core';
import { generatePairingSecret, QrPayload } from './pairing';
import { deriveSessionKey } from './sessionCrypto';

export type BridgeSessionState =
  | 'pending'
  | 'connected'
  | 'awaiting-consent'
  | 'transferring'
  | 'completed'
  | 'expired'
  | 'cancelled';

export type BridgeTeardownReason = 'completed' | 'timeout' | 'cancelled' | 'backgrounded';

export interface TransferRequest {
  /** What the desktop is asking for — shown verbatim on the phone's consent screen. Never auto-approved. */
  description: string;
}

const DEFAULT_TTL_MS = 3 * 60 * 1000; // 3 minutes — within the spec's 2-5 minute range

/**
 * The session state machine described in docs/WEB_BRIDGE_THREAT_MODEL.md.
 * Owns the pairing secret and derived session key's lifetime, the
 * timeout, single-use enforcement, and the explicit-consent gate before
 * any transfer. Does not itself talk to a network — see that file's
 * "Verification scope" section for why the actual local server is a
 * separate, not-yet-implemented concern.
 */
export class BridgeSession {
  readonly sessionId: string;
  readonly expiresAt: number;
  private pairingSecret: Buffer | null;
  private derivedSessionKey: KeyHandle | null = null;
  private state: BridgeSessionState = 'pending';
  private pendingRequest: TransferRequest | null = null;
  private timeoutTimer: ReturnType<typeof setTimeout> | null = null;
  private teardownListeners: Array<(reason: BridgeTeardownReason) => void> = [];

  private constructor(ttlMs: number) {
    this.sessionId = randomUUID();
    this.pairingSecret = generatePairingSecret();
    this.expiresAt = Date.now() + ttlMs;
    this.timeoutTimer = setTimeout(() => this.teardown('timeout'), ttlMs);
  }

  static create(ttlMs: number = DEFAULT_TTL_MS): BridgeSession {
    return new BridgeSession(ttlMs);
  }

  getState(): BridgeSessionState {
    return this.state;
  }

  /** `ip`/`port` come from the caller — this class has no network awareness of its own. */
  qrPayload(ip: string, port: number): QrPayload {
    this.requirePairingSecret();
    return {
      ip,
      port,
      secret: this.pairingSecret!.toString('base64'),
      sessionId: this.sessionId,
      expiresAt: this.expiresAt,
    };
  }

  onTeardown(listener: (reason: BridgeTeardownReason) => void): () => void {
    this.teardownListeners.push(listener);
    return () => {
      this.teardownListeners = this.teardownListeners.filter((l) => l !== listener);
    };
  }

  /**
   * Called once the desktop side has completed the crypto handshake —
   * i.e. sent a first message that decrypted correctly under the
   * derived session key, proving possession of the pairing secret. This
   * class doesn't perform that decryption itself (no network I/O here);
   * the caller does it with sessionKey() and reports success here.
   */
  markConnected(): void {
    this.requireState('pending');
    this.state = 'connected';
  }

  async sessionKey(): Promise<KeyHandle> {
    this.requirePairingSecret();
    if (!this.derivedSessionKey) {
      this.derivedSessionKey = await deriveSessionKey(this.pairingSecret!, this.sessionId);
    }
    return this.derivedSessionKey;
  }

  /** The desktop side requests a specific item. Nothing is sent yet — this only surfaces the phone-side consent prompt. */
  requestTransfer(description: string): void {
    this.requireState('connected');
    this.pendingRequest = { description };
    this.state = 'awaiting-consent';
  }

  getPendingRequest(): TransferRequest | null {
    return this.pendingRequest;
  }

  /** The user approved on the phone. Caller is responsible for actually encrypting and sending the data next, then calling complete(). */
  approveTransfer(): void {
    this.requireState('awaiting-consent');
    this.state = 'transferring';
  }

  /** The user declined. Session returns to waiting for a (different) request rather than tearing down entirely. */
  denyTransfer(): void {
    this.requireState('awaiting-consent');
    this.pendingRequest = null;
    this.state = 'connected';
  }

  /** Marks the transfer done and tears the session down — single-use: no further requests are accepted after this. */
  complete(): void {
    this.requireState('transferring');
    this.state = 'completed';
    this.teardown('completed');
  }

  cancel(): void {
    if (this.isTerminal()) return;
    this.state = 'cancelled';
    this.teardown('cancelled');
  }

  /** Wire to the app's background-transition event — Web Bridge sessions are always torn down on backgrounding, not configurable. */
  handleAppBackgrounded(): void {
    if (this.isTerminal()) return;
    this.state = 'cancelled';
    this.teardown('backgrounded');
  }

  private isTerminal(): boolean {
    return this.state === 'completed' || this.state === 'expired' || this.state === 'cancelled';
  }

  private teardown(reason: BridgeTeardownReason): void {
    if (this.timeoutTimer !== null) {
      clearTimeout(this.timeoutTimer);
      this.timeoutTimer = null;
    }
    if (reason === 'timeout') this.state = 'expired';
    this.pairingSecret?.fill(0);
    this.pairingSecret = null;
    if (this.derivedSessionKey) getCryptoProvider().disposeKey(this.derivedSessionKey);
    this.derivedSessionKey = null;
    this.pendingRequest = null;
    for (const listener of this.teardownListeners) listener(reason);
  }

  private requirePairingSecret(): void {
    if (!this.pairingSecret) {
      throw new Error(`Bridge session ${this.sessionId} has already torn down (state: ${this.state})`);
    }
  }

  private requireState(expected: BridgeSessionState): void {
    if (this.state !== expected) {
      throw new Error(`Bridge session ${this.sessionId} expected state '${expected}' but is '${this.state}'`);
    }
  }
}
