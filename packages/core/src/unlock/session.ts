import { Buffer } from 'buffer';
import { KeyHandle } from '../crypto/CryptoProvider';
import { VaultStore } from '../storage/vaultStore';
import { VaultSettings } from '../storage/schema';

export type LockReason = 'timeout' | 'background' | 'device-lock' | 'manual';

const AUTO_LOCK_MS: Record<Exclude<VaultSettings['autoLock'], 'never'>, number> = {
  immediate: 0,
  '30s': 30_000,
  '1m': 60_000,
  '5m': 5 * 60_000,
  '15m': 15 * 60_000,
  '30m': 30 * 60_000,
};

/**
 * Owns the unlocked/locked lifecycle on top of VaultStore: the idle
 * auto-lock timer, and hooks for the app-lifecycle events the UI layer
 * wires up (background, device lock). Locking here always calls through
 * to VaultStore.lock(), which disposes the DEK — this class never holds
 * any key material of its own, only a reference to the store.
 *
 * Per the spec, "lock on app backgrounding" is configurable
 * (VaultSettings.lockOnBackground); "lock on device lock" and the idle
 * timer are not — they always fire.
 */
export class UnlockSession {
  private store: VaultStore | null = null;
  private lockTimerId: ReturnType<typeof setTimeout> | null = null;
  private lockListeners: Array<(reason: LockReason) => void> = [];

  get isUnlocked(): boolean {
    return this.store !== null;
  }

  /** Throws if locked — every call site needing vault access should expect that. */
  get vault(): VaultStore {
    if (!this.store) throw new Error('Vault is locked');
    return this.store;
  }

  onLock(callback: (reason: LockReason) => void): () => void {
    this.lockListeners.push(callback);
    return () => {
      this.lockListeners = this.lockListeners.filter((cb) => cb !== callback);
    };
  }

  async unlockWithPassword(password: Buffer): Promise<void> {
    this.store = await VaultStore.open(password);
    this.scheduleAutoLock();
  }

  /** For the biometric-unlock path — see packages/core/src/biometric. */
  async unlockWithDek(dek: KeyHandle): Promise<void> {
    this.store = await VaultStore.openWithDek(dek);
    this.scheduleAutoLock();
  }

  lock(reason: LockReason = 'manual'): void {
    this.clearAutoLockTimer();
    const wasUnlocked = this.store !== null;
    this.store?.lock();
    this.store = null;
    if (wasUnlocked) {
      for (const listener of this.lockListeners) listener(reason);
    }
  }

  /** Call on any user interaction (navigation, keystroke, ...) to reset the idle timer. */
  recordActivity(): void {
    if (this.store) this.scheduleAutoLock();
  }

  /** Wire to the app's background-transition event. Locks only if lockOnBackground is enabled. */
  handleAppBackgrounded(): void {
    if (this.store?.settings.lockOnBackground) {
      this.lock('background');
    }
  }

  /** Wire to the app's foreground-transition event — just restarts the idle timer. */
  handleAppForegrounded(): void {
    if (this.store) this.scheduleAutoLock();
  }

  /** Wire to a device screen-lock event. Always locks; this is not configurable. */
  handleDeviceLocked(): void {
    if (this.store) this.lock('device-lock');
  }

  private clearAutoLockTimer(): void {
    if (this.lockTimerId !== null) {
      clearTimeout(this.lockTimerId);
      this.lockTimerId = null;
    }
  }

  private scheduleAutoLock(): void {
    this.clearAutoLockTimer();
    if (!this.store) return;
    const setting = this.store.settings.autoLock;
    if (setting === 'never') return;
    this.lockTimerId = setTimeout(() => this.lock('timeout'), AUTO_LOCK_MS[setting]);
  }
}
