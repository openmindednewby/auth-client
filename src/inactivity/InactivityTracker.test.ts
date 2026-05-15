import { InactivityTracker, type InactivityStore } from './InactivityTracker';

interface MockStoreResult {
  store: InactivityStore;
  state: { value: number | null };
}

function createMockStore(initial: number | null = null): MockStoreResult {
  const state: { value: number | null } = { value: initial };
  const store: InactivityStore = {
    read: () => Promise.resolve(state.value),
    write: (ts) => {
      state.value = ts;
      return Promise.resolve();
    },
    clear: () => {
      state.value = null;
      return Promise.resolve();
    },
  };
  return { store, state };
}

const DAY_MS = 24 * 60 * 60 * 1000;

describe('InactivityTracker.markActive', () => {
  it('writes the current timestamp via injected now()', async () => {
    const { store, state } = createMockStore();
    const tracker = new InactivityTracker({ store, now: () => 12_345 });
    await tracker.markActive();
    expect(state.value).toBe(12_345);
  });

  it('uses Date.now when no now() is injected', async () => {
    const { store, state } = createMockStore();
    const tracker = new InactivityTracker({ store });
    const before = Date.now();
    await tracker.markActive();
    const after = Date.now();
    expect(state.value).not.toBeNull();
    expect(state.value as number).toBeGreaterThanOrEqual(before);
    expect(state.value as number).toBeLessThanOrEqual(after);
  });

  it('honours an explicit timestamp argument', async () => {
    const { store, state } = createMockStore();
    const tracker = new InactivityTracker({ store, now: () => 999 });
    await tracker.markActive(42);
    expect(state.value).toBe(42);
  });
});

describe('InactivityTracker.getLastActive', () => {
  it('returns null when nothing has been written', async () => {
    const { store } = createMockStore();
    const tracker = new InactivityTracker({ store });
    expect(await tracker.getLastActive()).toBeNull();
  });

  it('returns the stored timestamp', async () => {
    const { store } = createMockStore(42);
    const tracker = new InactivityTracker({ store });
    expect(await tracker.getLastActive()).toBe(42);
  });
});

describe('InactivityTracker.isExpired', () => {
  it('returns false when no timestamp has been recorded', async () => {
    const { store } = createMockStore();
    const tracker = new InactivityTracker({ store });
    expect(await tracker.isExpired()).toBe(false);
  });

  it('returns false when within the threshold (default 90 days)', async () => {
    const now = 1_000_000_000_000;
    const { store } = createMockStore(now - 89 * DAY_MS);
    const tracker = new InactivityTracker({ store, now: () => now });
    expect(await tracker.isExpired()).toBe(false);
  });

  it('returns false at exactly the threshold', async () => {
    const now = 1_000_000_000_000;
    const { store } = createMockStore(now - 90 * DAY_MS);
    const tracker = new InactivityTracker({ store, now: () => now });
    expect(await tracker.isExpired()).toBe(false);
  });

  it('returns true when over the default threshold', async () => {
    const now = 1_000_000_000_000;
    const { store } = createMockStore(now - 91 * DAY_MS);
    const tracker = new InactivityTracker({ store, now: () => now });
    expect(await tracker.isExpired()).toBe(true);
  });

  it('honours custom maxInactivityDays', async () => {
    const now = 1_000_000_000_000;
    const { store } = createMockStore(now - 8 * DAY_MS);
    const tracker = new InactivityTracker({ store, maxInactivityDays: 7, now: () => now });
    expect(await tracker.isExpired()).toBe(true);
  });

  it('treats zero days as immediate expiry whenever a timestamp exists', async () => {
    const now = 1_000_000;
    const { store } = createMockStore(now - 1);
    const tracker = new InactivityTracker({ store, maxInactivityDays: 0, now: () => now });
    expect(await tracker.isExpired()).toBe(true);
  });
});

describe('InactivityTracker.clear', () => {
  it('removes the stored timestamp', async () => {
    const { store, state } = createMockStore(42);
    const tracker = new InactivityTracker({ store });
    await tracker.clear();
    expect(state.value).toBeNull();
  });
});
