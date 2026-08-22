import { configureTestPlatform, resetPlatformForTests, TestPlatform } from '../../testing/configureTestPlatform';
import { ClipboardManager } from '../clipboardManager';

let platform: TestPlatform;

beforeEach(() => {
  platform = configureTestPlatform();
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
  resetPlatformForTests();
});

describe('ClipboardManager.copy', () => {
  it('writes the value to the clipboard and starts the countdown', async () => {
    const manager = new ClipboardManager(30);
    await manager.copy('hunter2');
    expect(platform.clipboard.writes.at(-1)).toBe('hunter2');
    expect(manager.getSecondsRemaining()).toBe(30);
  });

  it('counts down every second', async () => {
    const manager = new ClipboardManager(30);
    await manager.copy('hunter2');

    jest.advanceTimersByTime(5000);
    expect(manager.getSecondsRemaining()).toBe(25);
  });

  it('clears the clipboard automatically once the countdown reaches zero', async () => {
    const manager = new ClipboardManager(3);
    await manager.copy('hunter2');

    jest.advanceTimersByTime(3000);
    await Promise.resolve(); // let the fire-and-forget clear() microtask settle
    await Promise.resolve();

    expect(platform.clipboard.writes.at(-1)).toBe('');
    expect(manager.getSecondsRemaining()).toBe(0);
  });

  it('a second copy() cancels the first countdown rather than stacking timers', async () => {
    const manager = new ClipboardManager(30);
    await manager.copy('first');
    jest.advanceTimersByTime(10_000); // 20s remaining on the first copy
    await manager.copy('second');

    expect(manager.getSecondsRemaining()).toBe(30);
    expect(platform.clipboard.writes.at(-1)).toBe('second');

    // If the first timer were still alive, this would fire its
    // now-defunct clear at the 30s mark from copy #1 (20s from now).
    jest.advanceTimersByTime(20_000);
    expect(platform.clipboard.writes.at(-1)).toBe('second');
  });

  it('reports whether the write is known to have succeeded', async () => {
    const manager = new ClipboardManager(30);
    expect(await manager.copy('ok')).toBe(true);

    platform.clipboard.failNextWrite = true;
    expect(await manager.copy('will-fail')).toBe(false);
  });
});

describe('ClipboardManager.clear', () => {
  it('clears immediately and cancels the pending countdown', async () => {
    const manager = new ClipboardManager(30);
    await manager.copy('hunter2');

    await manager.clear();
    expect(platform.clipboard.writes.at(-1)).toBe('');
    expect(manager.getSecondsRemaining()).toBe(0);

    // No further auto-clear write should happen — clipboard stays empty
    // and no exception is thrown from a stray timer.
    jest.advanceTimersByTime(30_000);
    expect(platform.clipboard.writes.at(-1)).toBe('');
  });

  it('is safe to call with nothing pending, and reports success', async () => {
    const manager = new ClipboardManager(30);
    await expect(manager.clear()).resolves.toBe(true);
  });

  it('reports false and fires onClearFailure when the platform write fails — the web focus-loss case', async () => {
    const manager = new ClipboardManager(30);
    await manager.copy('hunter2');

    let failureFired = false;
    manager.onClearFailure(() => {
      failureFired = true;
    });

    platform.clipboard.failNextWrite = true;
    const succeeded = await manager.clear();

    expect(succeeded).toBe(false);
    expect(failureFired).toBe(true);
  });

  it('the automatic timer-driven clear also fires onClearFailure on failure, without anyone awaiting it', async () => {
    const manager = new ClipboardManager(2);
    let failureFired = false;
    manager.onClearFailure(() => {
      failureFired = true;
    });

    await manager.copy('hunter2');
    platform.clipboard.failNextWrite = true;

    jest.advanceTimersByTime(2000);
    await Promise.resolve();
    await Promise.resolve();

    expect(failureFired).toBe(true);
  });
});

describe('ClipboardManager.onTick', () => {
  it('notifies listeners on copy, each tick, and clear', async () => {
    const manager = new ClipboardManager(2);
    const seen: number[] = [];
    manager.onTick((s) => seen.push(s));

    await manager.copy('x');
    jest.advanceTimersByTime(1000);
    jest.advanceTimersByTime(1000);
    await Promise.resolve();
    await Promise.resolve();

    expect(seen).toEqual([2, 1, 0]);
  });

  it('unsubscribe stops further notifications', async () => {
    const manager = new ClipboardManager(30);
    const seen: number[] = [];
    const unsubscribe = manager.onTick((s) => seen.push(s));
    unsubscribe();

    await manager.copy('x');
    expect(seen).toEqual([]);
  });
});
