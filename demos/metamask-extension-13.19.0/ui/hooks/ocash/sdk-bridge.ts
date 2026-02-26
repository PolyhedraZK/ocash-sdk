/* eslint-disable @typescript-eslint/no-var-requires */

const sdkBridge = require('../../../../../dist/browser.cjs');

export const createSdk = sdkBridge.createSdk;
export const IndexedDbStore = sdkBridge.IndexedDbStore;
export const ETH_MAINNET = sdkBridge.ETH_MAINNET;
export const BSC_MAINNET = sdkBridge.BSC_MAINNET;
export const BASE_MAINNET = sdkBridge.BASE_MAINNET;
export const SEPOLIA_TESTNET = sdkBridge.SEPOLIA_TESTNET;
export const BSC_TESTNET = sdkBridge.BSC_TESTNET;

export type OCashSdk = import('../../../../../dist/browser.d.ts').OCashSdk;
export type StoredOperation =
  import('../../../../../dist/browser.d.ts').StoredOperation;
export type ChainConfigInput =
  import('../../../../../dist/browser.d.ts').ChainConfigInput;
