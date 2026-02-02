import type { AssetsOverride, ChainConfigInput, PlannerEstimateTransferResult, PlannerEstimateWithdrawResult, TokenMetadata } from '@ocash/sdk';

export type DemoConfig = {
  seed: string;
  accountNonce?: number;
  chains: ChainConfigInput[];
  assetsOverride?: AssetsOverride;
};

export type BalanceRow = {
  token: TokenMetadata;
  value: bigint;
};

export type LogEntry = {
  time: string;
  label: string;
  message: string;
  level: 'info' | 'warn' | 'error';
};

export type FeeRow = { label: string; value: string };

export type DepositEstimate = {
  protocolFee: bigint;
  depositRelayerFee: bigint;
  payAmount: bigint;
  value: bigint;
  approveNeeded: boolean;
};

export type TransferEstimate = PlannerEstimateTransferResult | null;
export type WithdrawEstimate = PlannerEstimateWithdrawResult | null;

export const NATIVE_ADDRESS = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

export const DEFAULT_CONFIG: DemoConfig = {
  seed: 'demo-seed-please-replace',
  accountNonce: 0,
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
          transferMaxAmount: '340282366920938463463374607431768211455',
          withdrawMaxAmount: '340282366920938463463374607431768211455',
        },
      ],
    },
  ],
  assetsOverride: {
    'wasm_exec.js': 'https://testnet-app.o.cash/wasm_exec.js',
    'app.wasm': [
      'https://testnet-app.o.cash/wasm/app_wasm_6_11328f2b/00',
      'https://testnet-app.o.cash/wasm/app_wasm_6_11328f2b/01',
      'https://testnet-app.o.cash/wasm/app_wasm_6_11328f2b/02',
      'https://testnet-app.o.cash/wasm/app_wasm_6_11328f2b/03',
      'https://testnet-app.o.cash/wasm/app_wasm_6_11328f2b/04',
      'https://testnet-app.o.cash/wasm/app_wasm_6_11328f2b/05',
    ],
    'transfer.r1cs': [
      'https://testnet-app.o.cash/wasm/transfer_r1cs_3_27e55c1f/00',
      'https://testnet-app.o.cash/wasm/transfer_r1cs_3_27e55c1f/01',
      'https://testnet-app.o.cash/wasm/transfer_r1cs_3_27e55c1f/02',
    ],
    'transfer.pk': [
      'https://testnet-app.o.cash/wasm/transfer_pk_8_a2f49c4d/00',
      'https://testnet-app.o.cash/wasm/transfer_pk_8_a2f49c4d/01',
      'https://testnet-app.o.cash/wasm/transfer_pk_8_a2f49c4d/02',
      'https://testnet-app.o.cash/wasm/transfer_pk_8_a2f49c4d/03',
      'https://testnet-app.o.cash/wasm/transfer_pk_8_a2f49c4d/04',
      'https://testnet-app.o.cash/wasm/transfer_pk_8_a2f49c4d/05',
      'https://testnet-app.o.cash/wasm/transfer_pk_8_a2f49c4d/06',
      'https://testnet-app.o.cash/wasm/transfer_pk_8_a2f49c4d/07',
    ],
    'withdraw.r1cs': 'https://testnet-app.o.cash/wasm/withdraw_13dc54c7.r1cs',
    'withdraw.pk': [
      'https://testnet-app.o.cash/wasm/withdraw_pk_3_ba3d9460/00',
      'https://testnet-app.o.cash/wasm/withdraw_pk_3_ba3d9460/01',
      'https://testnet-app.o.cash/wasm/withdraw_pk_3_ba3d9460/02',
    ],
  },
};
