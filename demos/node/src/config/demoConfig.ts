import { defaultAssetsOverrideTestnet, SEPOLIA_TESTNET, type AssetsOverride, type ChainConfigInput } from '@ocash/sdk';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const demoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export type DemoConfig = {
  seed: string;
  accountNonce?: number;
  storageDir?: string;
  cacheDir?: string;
  chains: ChainConfigInput[];
  assetsOverride?: AssetsOverride;
  signerPrivateKey?: `0x${string}`;
};

const defaultConfig: DemoConfig = {
  seed: 'demo-seed-please-replace',
  storageDir: path.join(demoRoot, '.ocash-demo'),
  cacheDir: path.join(demoRoot, '.ocash-demo/cache'),
  chains: [SEPOLIA_TESTNET],
};

const isHexPrivKey = (value: unknown): value is `0x${string}` => typeof value === 'string' && /^0x[0-9a-fA-F]{64}$/.test(value);

export async function loadDemoConfig(options?: { configPath?: string | boolean }) {
  const configPath = typeof options?.configPath === 'string' ? options.configPath : path.join(demoRoot, 'ocash.config.json');
  let fromFile: Partial<DemoConfig> | undefined;
  try {
    const raw = await readFile(configPath, 'utf8');
    fromFile = JSON.parse(raw) as Partial<DemoConfig>;
  } catch {
    fromFile = undefined;
  }

  const config: DemoConfig = {
    ...defaultConfig,
    ...fromFile,
    assetsOverride: fromFile?.assetsOverride ?? defaultAssetsOverrideTestnet,
    signerPrivateKey: isHexPrivKey(fromFile?.signerPrivateKey) ? fromFile.signerPrivateKey : undefined,
  };

  if (!config.assetsOverride) {
    config.assetsOverride = defaultAssetsOverrideTestnet;
  }
  return config;
}
