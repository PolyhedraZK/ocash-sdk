import type { AssetsOverride } from '../types';

export const defaultAssetsOverrideTestnet: AssetsOverride = {
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
};

export const defaultAssetsOverrideMainnet: AssetsOverride = {
  'wasm_exec.js': 'https://app.o.cash/wasm_exec.js',
  'app.wasm': [
    'https://app.o.cash/wasm/app_wasm_6_11328f2b/00',
    'https://app.o.cash/wasm/app_wasm_6_11328f2b/01',
    'https://app.o.cash/wasm/app_wasm_6_11328f2b/02',
    'https://app.o.cash/wasm/app_wasm_6_11328f2b/03',
    'https://app.o.cash/wasm/app_wasm_6_11328f2b/04',
    'https://app.o.cash/wasm/app_wasm_6_11328f2b/05',
  ],
  'transfer.r1cs': [
    'https://app.o.cash/wasm/transfer_r1cs_3_27e55c1f/00',
    'https://app.o.cash/wasm/transfer_r1cs_3_27e55c1f/01',
    'https://app.o.cash/wasm/transfer_r1cs_3_27e55c1f/02',
  ],
  'transfer.pk': [
    'https://app.o.cash/wasm/transfer_pk_8_a2f49c4d/00',
    'https://app.o.cash/wasm/transfer_pk_8_a2f49c4d/01',
    'https://app.o.cash/wasm/transfer_pk_8_a2f49c4d/02',
    'https://app.o.cash/wasm/transfer_pk_8_a2f49c4d/03',
    'https://app.o.cash/wasm/transfer_pk_8_a2f49c4d/04',
    'https://app.o.cash/wasm/transfer_pk_8_a2f49c4d/05',
    'https://app.o.cash/wasm/transfer_pk_8_a2f49c4d/06',
    'https://app.o.cash/wasm/transfer_pk_8_a2f49c4d/07',
  ],
  'withdraw.r1cs': 'https://app.o.cash/wasm/withdraw_13dc54c7.r1cs',
  'withdraw.pk': [
    'https://app.o.cash/wasm/withdraw_pk_3_ba3d9460/00',
    'https://app.o.cash/wasm/withdraw_pk_3_ba3d9460/01',
    'https://app.o.cash/wasm/withdraw_pk_3_ba3d9460/02',
  ],
};
