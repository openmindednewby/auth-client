import { AuthEventEmitter } from './AuthEventEmitter';

describe('AuthEventEmitter', () => {
  it('invokes registered listeners on emit', () => {
    const emitter = new AuthEventEmitter();
    const listener = jest.fn();
    emitter.on('sessionExpired', listener);
    emitter.emit('sessionExpired');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('invokes multiple listeners in registration order', () => {
    const emitter = new AuthEventEmitter();
    const calls: string[] = [];
    emitter.on('sessionExpired', () => calls.push('a'));
    emitter.on('sessionExpired', () => calls.push('b'));
    emitter.emit('sessionExpired');
    expect(calls).toEqual(['a', 'b']);
  });

  it('does not invoke listener after unsubscribe', () => {
    const emitter = new AuthEventEmitter();
    const listener = jest.fn();
    const unsubscribe = emitter.on('sessionExpired', listener);
    unsubscribe();
    emitter.emit('sessionExpired');
    expect(listener).not.toHaveBeenCalled();
  });

  it('emit is a no-op when no listeners are registered', () => {
    const emitter = new AuthEventEmitter();
    expect(() => emitter.emit('sessionExpired')).not.toThrow();
  });

  it('allows a listener to unsubscribe during dispatch without skipping later listeners', () => {
    const emitter = new AuthEventEmitter();
    const calls: string[] = [];
    let unsubscribeB: (() => void) | undefined;
    emitter.on('sessionExpired', () => {
      calls.push('a');
      if (unsubscribeB !== undefined) {
        unsubscribeB();
      }
    });
    unsubscribeB = emitter.on('sessionExpired', () => calls.push('b'));
    emitter.on('sessionExpired', () => calls.push('c'));
    emitter.emit('sessionExpired');
    // Snapshot semantics: b still runs once because it was in the snapshot when emit started.
    expect(calls).toEqual(['a', 'b', 'c']);
  });

  it('unsubscribe is idempotent and safe after clear()', () => {
    const emitter = new AuthEventEmitter();
    const listener = jest.fn();
    const unsubscribe = emitter.on('sessionExpired', listener);
    emitter.clear();
    expect(() => unsubscribe()).not.toThrow();
    emitter.emit('sessionExpired');
    expect(listener).not.toHaveBeenCalled();
  });

  it('clear removes all listeners across events', () => {
    const emitter = new AuthEventEmitter();
    const listener = jest.fn();
    emitter.on('sessionExpired', listener);
    emitter.clear();
    emitter.emit('sessionExpired');
    expect(listener).not.toHaveBeenCalled();
  });
});
