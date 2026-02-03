import { defaultAssetsOverride, type AssetsOverride, type ChainConfigInput } from '@ocash/sdk';
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
  chains: [
    {
      chainId: 11155111,
      rpcUrl: 'https://sepolia.drpc.org',
      entryUrl: 'https://batrider.api.o.cash',
      ocashContractAddress: '0x6e867888d731c2b02f1466a9916656e4ae0f7e43',
      relayerUrl: 'https://batrider.relayer.sepolia.o.cash',
      merkleProofUrl: 'https://batrider.merkle.sepolia.o.cash',
      tokens: [
        {
          id: '1597926149423906336818683031823679313666371576738115454886730516203513418507',
          symbol: 'SepoliaETH',
          decimals: 18,
          wrappedErc20: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
          viewerPk: ['15427800331731605767509081567773831702494549120156100775953327498972353997316', '4594254759776032429725497597312133515458271658807168187390598332866032906292'],
          freezerPk: ['4224390570119711710057096089379658798272279480371959814853894477885065716429', '21722402525823844618662313438395170901845286803631020833835665861415293538245'],
          depositFeeBps: 0,
          withdrawFeeBps: 25,
          transferMaxAmount: 340282366920938463463374607431768211455n,
          withdrawMaxAmount: 340282366920938463463374607431768211455n,
        },
      ],
    },
  ],
  assetsOverride: undefined,
};

const isHexPrivKey = (value: unknown): value is `0x${string}` => typeof value === 'string' && /^0x[0-9a-fA-F]{64}$/.test(value);

export async function loadDemoConfig(options?: { configPath?: string | boolean }) {
  const configPath =
    typeof options?.configPath === 'string'
      ? options.configPath
      : path.join(demoRoot, 'ocash.config.json');
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
    assetsOverride: fromFile?.assetsOverride ?? defaultAssetsOverride,
    signerPrivateKey: isHexPrivKey((fromFile as any)?.signerPrivateKey) ? ((fromFile as any).signerPrivateKey as any) : undefined,
  };

  if (!config.assetsOverride) {
    config.assetsOverride = defaultAssetsOverride;
  }
  return config;
}
