export const signalTimeout = (ms: number): AbortSignal => {
  const anyAbortSignal = AbortSignal as any;
  if (typeof anyAbortSignal?.timeout === 'function') return anyAbortSignal.timeout(ms) as AbortSignal;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(new Error('timeout')), ms);
  controller.signal.addEventListener('abort', () => clearTimeout(t), { once: true });
  return controller.signal;
};

export const signalAny = (signals: Array<AbortSignal | undefined>): AbortSignal | undefined => {
  const list = signals.filter(Boolean) as AbortSignal[];
  if (!list.length) return undefined;
  const anyAbortSignal = AbortSignal as any;
  if (typeof anyAbortSignal?.any === 'function') return anyAbortSignal.any(list) as AbortSignal;
  const controller = new AbortController();
  const onAbort = (s: AbortSignal) => controller.abort((s as any).reason);
  for (const s of list) {
    if (s.aborted) {
      onAbort(s);
      break;
    }
    s.addEventListener('abort', () => onAbort(s), { once: true });
  }
  return controller.signal;
};
