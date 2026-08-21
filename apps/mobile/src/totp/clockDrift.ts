export interface ClockDriftWarning {
  detectedAt: number;
  expectedElapsedMs: number;
  actualElapsedMs: number;
  driftMs: number;
}

/**
 * Detects sudden, large jumps in the device's wall clock — the case that
 * actually breaks TOTP, where a user (or a buggy app) sets the system
 * time far off from reality. It works because JS interval timers are
 * scheduled against a monotonic clock: if the *wall clock* (Date.now())
 * jumps by much more or less than the *real elapsed time* between two
 * ticks, the wall clock moved independent of time actually passing.
 *
 * Deliberately does NOT claim to detect small, gradual clock drift (a
 * few seconds of accumulated skew) — that needs a trusted external time
 * source (NTP), which this app cannot use without a network call,
 * contradicting invariant #4. This only ever compares the device against
 * itself, so it warns on step-changes, not slow drift. Document that
 * honestly wherever this feeds UI copy: "your clock looks off" is
 * accurate; "your codes are wrong because of drift" overclaims.
 */
export class ClockDriftMonitor {
  private lastCheck: number;
  private timerId: ReturnType<typeof setInterval> | null = null;
  private listeners: Array<(warning: ClockDriftWarning) => void> = [];

  constructor(
    private checkIntervalMs = 5000,
    private thresholdMs = 3000
  ) {
    this.lastCheck = Date.now();
  }

  start(): void {
    if (this.timerId !== null) return;
    this.lastCheck = Date.now();
    this.timerId = setInterval(() => this.check(), this.checkIntervalMs);
  }

  stop(): void {
    if (this.timerId !== null) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
  }

  onDrift(listener: (warning: ClockDriftWarning) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  /** Exposed for the UI/tests to force an immediate check outside the timer cadence. */
  check(): ClockDriftWarning | null {
    const now = Date.now();
    const actualElapsedMs = now - this.lastCheck;
    const driftMs = actualElapsedMs - this.checkIntervalMs;
    this.lastCheck = now;

    if (Math.abs(driftMs) <= this.thresholdMs) return null;

    const warning: ClockDriftWarning = {
      detectedAt: now,
      expectedElapsedMs: this.checkIntervalMs,
      actualElapsedMs,
      driftMs,
    };
    for (const listener of this.listeners) listener(warning);
    return warning;
  }
}
