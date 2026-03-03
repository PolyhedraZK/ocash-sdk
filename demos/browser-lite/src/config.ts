import { SEPOLIA_TESTNET, defaultAssetsOverrideTestnet } from '@ocash/sdk';
import type { AssetsOverride, ChainConfigInput } from '@ocash/sdk';

export const CHAIN: ChainConfigInput = SEPOLIA_TESTNET;
export const ASSETS_OVERRIDE: AssetsOverride = defaultAssetsOverrideTestnet;
export const DEFAULT_SEED = 'demo-seed-please-replace';
export const DEFAULT_ACCOUNT_NONCE = 0;
