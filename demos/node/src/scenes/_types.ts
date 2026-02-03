import type { OCashSdk, StorageAdapter } from '@ocash/sdk';
import type { DemoConfig } from '../config/demoConfig.js';

export type DemoContext = {
  sdk: OCashSdk;
  store: StorageAdapter;
  config: DemoConfig;
  flags: Record<string, string | boolean | undefined>;
};
