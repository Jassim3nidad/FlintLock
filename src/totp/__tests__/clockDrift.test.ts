import { ClockDriftMonitor } from '../clockDrift';

describe('ClockDriftMonitor', () => {
  let nowValue: number;

  beforeEach(() => {
    nowValue = 1_000_000;
    jest.spyOn(Date, 'now').mockImplementation(() => nowValue);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('does not warn when elapsed time matches the expected interval', () => {
    const monitor = new ClockDriftMonitor(5000, 3000);
    const spy = jest.fn();
    monitor.onDrift(spy);

    nowValue += 5000; // exactly the expected interval
    expect(monitor.check()).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  it('does not warn for small jitter within the threshold', () => {
    const monitor = new ClockDriftMonitor(5000, 3000);
    const spy = jest.fn();
    monitor.onDrift(spy);

    nowValue += 5000 + 2000; // 2s over, within the 3s threshold
    expect(monitor.check()).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  it('warns when the wall clock jumps forward far more than real time should have elapsed', () => {
    const monitor = new ClockDriftMonitor(5000, 3000);
    const spy = jest.fn();
    monitor.onDrift(spy);

    nowValue += 5000 + 3600_000; // jumped an extra hour
    const warning = monitor.check();

    expect(warning).not.toBeNull();
    expect(warning!.driftMs).toBeCloseTo(3600_000, -2);
    expect(spy).toHaveBeenCalledWith(warning);
  });

  it('warns when the wall clock jumps backward', () => {
    const monitor = new ClockDriftMonitor(5000, 3000);
    nowValue -= 3600_000; // clock set an hour into the past
    const warning = monitor.check();

    expect(warning).not.toBeNull();
    expect(warning!.driftMs).toBeLessThan(0);
  });

  it('unsubscribe stops further notifications', () => {
    const monitor = new ClockDriftMonitor(5000, 3000);
    const spy = jest.fn();
    const unsubscribe = monitor.onDrift(spy);
    unsubscribe();

    nowValue += 5000 + 3600_000;
    monitor.check();
    expect(spy).not.toHaveBeenCalled();
  });

  it('start()/stop() wire the interval without throwing, and stop() is idempotent', () => {
    jest.useFakeTimers();
    const monitor = new ClockDriftMonitor(5000, 3000);
    monitor.start();
    monitor.start(); // should not double-schedule
    monitor.stop();
    monitor.stop(); // idempotent
    jest.useRealTimers();
  });
});
