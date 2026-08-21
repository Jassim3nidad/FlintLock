jest.mock('../native');

import { Clipboard } from '../native';
import { ClipboardManager } from '../clipboardManager';

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('ClipboardManager.copy', () => {
  it('writes the value to the clipboard and starts the countdown', async () => {
    const manager = new ClipboardManager(30);
    await manager.copy('hunter2');
    expect(await Clipboard.getString()).toBe('hunter2');
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

    expect(await Clipboard.getString()).toBe('');
    expect(manager.getSecondsRemaining()).toBe(0);
  });

  it('a second copy() cancels the first countdown rather than stacking timers', async () => {
    const manager = new ClipboardManager(30);
    await manager.copy('first');
    jest.advanceTimersByTime(10_000); // 20s remaining on the first copy
    await manager.copy('second');

    expect(manager.getSecondsRemaining()).toBe(30);
    expect(await Clipboard.getString()).toBe('second');

    // If the first timer were still alive, this would fire its
    // now-defunct clear at the 30s mark from copy #1 (20s from now).
    jest.advanceTimersByTime(20_000);
    expect(await Clipboard.getString()).toBe('second');
  });
});

describe('ClipboardManager.clear', () => {
  it('clears immediately and cancels the pending countdown', async () => {
    const manager = new ClipboardManager(30);
    await manager.copy('hunter2');

    await manager.clear();
    expect(await Clipboard.getString()).toBe('');
    expect(manager.getSecondsRemaining()).toBe(0);

    // No further auto-clear write should happen — clipboard stays empty
    // and no exception is thrown from a stray timer.
    jest.advanceTimersByTime(30_000);
    expect(await Clipboard.getString()).toBe('');
  });

  it('is safe to call with nothing pending', async () => {
    const manager = new ClipboardManager(30);
    await expect(manager.clear()).resolves.toBeUndefined();
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
