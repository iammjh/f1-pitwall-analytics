/** Start an effect-owned request and invalidate all callbacks on cleanup. */
export function startScopedRequest<T>(
  load: () => Promise<T>,
  callbacks: {
    onSuccess: (value: T) => void;
    onError?: (error: unknown) => void;
    onSettled?: () => void;
  },
): () => void {
  let active = true;

  Promise.resolve()
    .then(load)
    .then((value) => {
      if (active) callbacks.onSuccess(value);
    })
    .catch((error: unknown) => {
      if (active) callbacks.onError?.(error);
    })
    .finally(() => {
      if (active) callbacks.onSettled?.();
    });

  return () => {
    active = false;
  };
}
