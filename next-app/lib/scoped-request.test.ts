import { describe, expect, it, vi } from 'vitest';
import { startScopedRequest } from './scoped-request';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

async function flush() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('effect-owned requests', () => {
  it('keeps the new season when the previous response arrives last', async () => {
    const oldSeason = deferred<string>();
    const newSeason = deferred<string>();
    const setData = vi.fn();
    const setLoading = vi.fn();
    const callbacks = { onSuccess: setData, onSettled: setLoading };
    const cleanup = startScopedRequest(() => oldSeason.promise, callbacks);
    cleanup();
    startScopedRequest(() => newSeason.promise, callbacks);

    newSeason.resolve('2026');
    await flush();
    oldSeason.resolve('2025');
    await flush();

    expect(setData.mock.calls).toEqual([['2026']]);
    expect(setLoading).toHaveBeenCalledTimes(1);
  });

  it('ignores errors and loading changes from an obsolete or unmounted request', async () => {
    const result = deferred<string>();
    const callbacks = { onSuccess: vi.fn(), onError: vi.fn(), onSettled: vi.fn() };
    const cleanup = startScopedRequest(() => result.promise, callbacks);
    cleanup();
    result.reject(new Error('old request failed'));
    await flush();
    Object.values(callbacks).forEach((callback) => expect(callback).not.toHaveBeenCalled());
  });

  it('reports an active failure and settles once, including synchronous loader errors', async () => {
    const error = new Error('failed to load');
    const callbacks = { onSuccess: vi.fn(), onError: vi.fn(), onSettled: vi.fn() };
    startScopedRequest(() => { throw error; }, callbacks);
    await flush();
    expect(callbacks.onSuccess).not.toHaveBeenCalled();
    expect(callbacks.onError).toHaveBeenCalledExactlyOnceWith(error);
    expect(callbacks.onSettled).toHaveBeenCalledTimes(1);
  });
});
