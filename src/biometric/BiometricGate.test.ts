import { BiometricGate, type BiometricFlagStore, type LocalAuthLike } from './BiometricGate';

interface MockLocalAuth {
  adapter: LocalAuthLike;
  hasHardwareAsync: jest.Mock;
  isEnrolledAsync: jest.Mock;
  authenticateAsync: jest.Mock;
}

function createMockLocalAuth(): MockLocalAuth {
  const hasHardwareAsync = jest.fn().mockResolvedValue(true);
  const isEnrolledAsync = jest.fn().mockResolvedValue(true);
  const authenticateAsync = jest.fn().mockResolvedValue({ success: true });
  const adapter: LocalAuthLike = {
    hasHardwareAsync,
    isEnrolledAsync,
    authenticateAsync,
  };
  return { adapter, hasHardwareAsync, isEnrolledAsync, authenticateAsync };
}

function createMockFlagStore(initial: boolean = false): {
  store: BiometricFlagStore;
  state: { value: boolean };
} {
  const state = { value: initial };
  const store: BiometricFlagStore = {
    read: () => Promise.resolve(state.value),
    write: (enabled) => {
      state.value = enabled;
      return Promise.resolve();
    },
  };
  return { store, state };
}

describe('BiometricGate.isAvailable', () => {
  it('returns false when device has no biometric hardware', async () => {
    const mock = createMockLocalAuth();
    mock.hasHardwareAsync.mockResolvedValueOnce(false);
    const gate = new BiometricGate({ localAuth: mock.adapter });
    expect(await gate.isAvailable()).toBe(false);
  });

  it('returns false when no biometric is enrolled', async () => {
    const mock = createMockLocalAuth();
    mock.isEnrolledAsync.mockResolvedValueOnce(false);
    const gate = new BiometricGate({ localAuth: mock.adapter });
    expect(await gate.isAvailable()).toBe(false);
  });

  it('returns true when hardware present and enrolled', async () => {
    const mock = createMockLocalAuth();
    const gate = new BiometricGate({ localAuth: mock.adapter });
    expect(await gate.isAvailable()).toBe(true);
  });
});

describe('BiometricGate enable/disable', () => {
  it('isEnabled defaults to false (opt-in)', () => {
    const mock = createMockLocalAuth();
    const gate = new BiometricGate({ localAuth: mock.adapter });
    expect(gate.isEnabled()).toBe(false);
  });

  it('setEnabled flips the flag and persists via flagStore', async () => {
    const mock = createMockLocalAuth();
    const flag = createMockFlagStore(false);
    const gate = new BiometricGate({ localAuth: mock.adapter, flagStore: flag.store });
    await gate.setEnabled(true);
    expect(gate.isEnabled()).toBe(true);
    expect(flag.state.value).toBe(true);
  });

  it('setEnabled works without flagStore', async () => {
    const mock = createMockLocalAuth();
    const gate = new BiometricGate({ localAuth: mock.adapter });
    await gate.setEnabled(true);
    expect(gate.isEnabled()).toBe(true);
  });

  it('hydrate reads persisted flag once', async () => {
    const mock = createMockLocalAuth();
    const flag = createMockFlagStore(true);
    const readSpy = jest.spyOn(flag.store, 'read');
    const gate = new BiometricGate({ localAuth: mock.adapter, flagStore: flag.store });
    await gate.hydrate();
    await gate.hydrate();
    expect(gate.isEnabled()).toBe(true);
    expect(readSpy).toHaveBeenCalledTimes(1);
  });

  it('hydrate is a no-op without flagStore', async () => {
    const mock = createMockLocalAuth();
    const gate = new BiometricGate({ localAuth: mock.adapter });
    await gate.hydrate();
    expect(gate.isEnabled()).toBe(false);
  });

  it('setEnabled resets the failure counter', async () => {
    const mock = createMockLocalAuth();
    mock.authenticateAsync.mockResolvedValue({ success: false });
    const gate = new BiometricGate({ localAuth: mock.adapter, maxFailures: 3 });
    await gate.setEnabled(true);
    await expect(gate.unlock()).rejects.toThrow();
    await expect(gate.unlock()).rejects.toThrow();
    await gate.setEnabled(true);
    // Counter reset — next failure is fresh, not at threshold.
    mock.authenticateAsync.mockResolvedValueOnce({ success: false });
    await expect(gate.unlock()).rejects.toThrow('failed');
  });
});

describe('BiometricGate.prompt', () => {
  it('returns true on success', async () => {
    const mock = createMockLocalAuth();
    const gate = new BiometricGate({ localAuth: mock.adapter });
    expect(await gate.prompt()).toBe(true);
  });

  it('returns false on failure (does NOT throw)', async () => {
    const mock = createMockLocalAuth();
    mock.authenticateAsync.mockResolvedValueOnce({ success: false });
    const gate = new BiometricGate({ localAuth: mock.adapter });
    expect(await gate.prompt()).toBe(false);
  });

  it('passes promptMessage to localAuth', async () => {
    const mock = createMockLocalAuth();
    const gate = new BiometricGate({ localAuth: mock.adapter, promptMessage: 'Custom message' });
    await gate.prompt();
    expect(mock.authenticateAsync).toHaveBeenCalledWith({ promptMessage: 'Custom message' });
  });

  it('uses default prompt message when not provided', async () => {
    const mock = createMockLocalAuth();
    const gate = new BiometricGate({ localAuth: mock.adapter });
    await gate.prompt();
    expect(mock.authenticateAsync).toHaveBeenCalledWith({ promptMessage: 'Unlock to continue' });
  });
});

describe('BiometricGate.unlock', () => {
  it('is a no-op when disabled', async () => {
    const mock = createMockLocalAuth();
    const gate = new BiometricGate({ localAuth: mock.adapter });
    await expect(gate.unlock()).resolves.toBeUndefined();
    expect(mock.authenticateAsync).not.toHaveBeenCalled();
  });

  it('succeeds and resets failure counter when authentication succeeds', async () => {
    const mock = createMockLocalAuth();
    const gate = new BiometricGate({ localAuth: mock.adapter, maxFailures: 3 });
    await gate.setEnabled(true);
    mock.authenticateAsync.mockResolvedValueOnce({ success: false });
    await expect(gate.unlock()).rejects.toThrow();
    mock.authenticateAsync.mockResolvedValueOnce({ success: true });
    await expect(gate.unlock()).resolves.toBeUndefined();
    // After success, counter is reset — two more failures should still be below threshold.
    mock.authenticateAsync.mockResolvedValueOnce({ success: false });
    await expect(gate.unlock()).rejects.toThrow('failed');
    mock.authenticateAsync.mockResolvedValueOnce({ success: false });
    await expect(gate.unlock()).rejects.toThrow('failed');
  });

  it('throws "failed" on first failure', async () => {
    const mock = createMockLocalAuth();
    mock.authenticateAsync.mockResolvedValue({ success: false });
    const gate = new BiometricGate({ localAuth: mock.adapter, maxFailures: 3 });
    await gate.setEnabled(true);
    await expect(gate.unlock()).rejects.toThrow('Biometric authentication failed');
  });

  it('throws "locked out" on the third consecutive failure', async () => {
    const mock = createMockLocalAuth();
    mock.authenticateAsync.mockResolvedValue({ success: false });
    const gate = new BiometricGate({ localAuth: mock.adapter, maxFailures: 3 });
    await gate.setEnabled(true);
    await expect(gate.unlock()).rejects.toThrow('failed');
    await expect(gate.unlock()).rejects.toThrow('failed');
    await expect(gate.unlock()).rejects.toThrow('locked out');
  });

  it('respects custom maxFailures', async () => {
    const mock = createMockLocalAuth();
    mock.authenticateAsync.mockResolvedValue({ success: false });
    const gate = new BiometricGate({ localAuth: mock.adapter, maxFailures: 1 });
    await gate.setEnabled(true);
    await expect(gate.unlock()).rejects.toThrow('locked out');
  });

  it('resetFailures clears the counter manually', async () => {
    const mock = createMockLocalAuth();
    mock.authenticateAsync.mockResolvedValue({ success: false });
    const gate = new BiometricGate({ localAuth: mock.adapter, maxFailures: 3 });
    await gate.setEnabled(true);
    await expect(gate.unlock()).rejects.toThrow('failed');
    await expect(gate.unlock()).rejects.toThrow('failed');
    gate.resetFailures();
    await expect(gate.unlock()).rejects.toThrow('failed');
  });
});
