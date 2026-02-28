import OcashSdk from '@ocash/sdk';
import type { OCashSdk, OCashSdkConfig, SdkEvent, StorageAdapter } from '@ocash/sdk';
import type { DemoConfig } from '../config/demoConfig.js';
import { c } from '../cli/color.js';

const safeJson = (value: unknown) => {
  try {
    return JSON.stringify(value, (_k, v) => (typeof v === 'bigint' ? v.toString() : v));
  } catch {
    return String(value);
  }
};

const createEventPrinter = (options?: { verbose?: boolean }) => {
  const verbose = Boolean(options?.verbose);
  return (evt: SdkEvent) => {
    if (evt.type === 'core:progress') {
      if (!verbose) return;
      const pct = evt.payload.total ? Math.floor((evt.payload.loaded / evt.payload.total) * 100) : evt.payload.loaded;
      console.log(c.cyan(`[core:${evt.payload.stage}]`), c.gray(String(pct)));
      return;
    }
    if (evt.type === 'debug') {
      const detail = evt.payload.detail != null ? ` ${safeJson(evt.payload.detail)}` : '';
      console.log(c.gray(`[debug:${evt.payload.scope}]`), c.dim(evt.payload.message + detail));
      return;
    }
    if (evt.type === 'sync:progress') {
      if (!verbose) return;
      console.log(c.magenta(`[sync:${evt.payload.chainId}:${evt.payload.resource}]`), c.cyan(String(evt.payload.downloaded)), c.cyan('/'), c.cyan(String(evt.payload.total ?? '?')));
      return;
    }
    if (evt.type === 'error') {
      const detail = evt.payload.detail != null ? ` detail=${safeJson(evt.payload.detail)}` : '';
      const cause = evt.payload.cause && typeof (evt.payload.cause as any)?.message === 'string' ? ` cause=${(evt.payload.cause as any).message}` : '';
      console.error(c.red('[sdk:error]'), c.red(evt.payload.code), evt.payload.message + detail + cause);
      return;
    }
    if (verbose) console.log(c.dim('[sdk:event]'), c.dim(evt.type), evt.payload);
  };
};

export function createDemoSdk(options: {
  config: DemoConfig;
  storage: StorageAdapter;
  verboseEvents?: boolean;
  silentEvents?: boolean;
  sync?: { pageSize?: number; pollMs?: number; requestTimeoutMs?: number };
  merkle?: OCashSdkConfig['merkle'];
  onEvent?: (evt: SdkEvent) => void;
}): OCashSdk {
  const onEvent =
    options.onEvent ??
    (options.silentEvents
      ? () => {} // for interactive CLI process separation
      : createEventPrinter({ verbose: Boolean(options.verboseEvents) }));
  return OcashSdk.createSdk({
    chains: options.config.chains,
    assetsOverride: options.config.assetsOverride,
    cacheDir: options.config.cacheDir,
    runtime: 'node',
    storage: options.storage,
    sync: options.sync,
    merkle: options.merkle,
    onEvent,
  });
}
