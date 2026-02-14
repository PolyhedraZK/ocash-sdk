/**
 * Create an AbortSignal that fires after a timeout.
 */
export const signalTimeout = (ms: number): AbortSignal => {
  const anyAbortSignal = AbortSignal;
  if (typeof anyAbortSignal?.timeout === 'function') return anyAbortSignal.timeout(ms) as AbortSignal;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(new Error('timeout')), ms);
  controller.signal.addEventListener('abort', () => clearTimeout(t), { once: true });
  return controller.signal;
};

/**
 * Combine multiple signals into one that aborts on the first abort.
 */
export const signalAny = (signals: Array<AbortSignal | undefined>): AbortSignal | undefined => {
  const list = signals.filter(Boolean) as AbortSignal[];
  if (!list.length) return undefined;
  const anyAbortSignal = AbortSignal;
  if (typeof anyAbortSignal?.any === 'function') return anyAbortSignal.any(list);
  const controller = new AbortController();
  const onAbort = (s: AbortSignal) => controller.abort(s.reason);
  for (const s of list) {
    if (s.aborted) {
      onAbort(s);
      break;
    }
    s.addEventListener('abort', () => onAbort(s), { once: true });
  }
  return controller.signal;
};
