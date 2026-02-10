export type {
  OCashSdk,
  OCashSdkConfig,
  SdkEvent,
  ChainConfigInput,
  Hex,
  TokenMetadata,
  CommitmentData,
  ProofResult,
  TransferWitnessInput,
  WithdrawWitnessInput,
  WitnessBuildResult,
  WitnessContext,
  TransactionReceipt,
  AssetsOverride,
  AssetOverrideEntry,
  StorageAdapter,
  ListUtxosQuery,
  EntryMemoRecord,
  EntryNullifierRecord,
  ListEntryMemosQuery,
  ListEntryNullifiersQuery,
  MerkleLeafRecord,
  MerkleNodeRecord,
  MerkleTreeState,
  SyncChainStatus,
  SyncCursor,
  PlannerEstimateTransferResult,
  PlannerEstimateWithdrawResult,
  UtxoRecord,
  WalletSessionInput,
  OpsApi,
  RelayerRequest,
} from './types';
export {
  defaultAssetsOverrideMainnet,
  defaultAssetsOverrideTestnet,
} from './assets/defaultAssetsOverride';
export { MemoKit } from './memo/memoKit';
export { CryptoToolkit } from './crypto/cryptoToolkit';
export { KeyManager } from './crypto/keyManager';
export { LedgerInfo } from './ledger/ledgerInfo';
export { normalizeTokenMetadata } from './ledger/tokenNormalize';
export { assertTokenMetadata, assertTokenList, assertChainConfigInput } from './ledger/validate';
export { fetchPoolTokensFromContract } from './ledger/poolsFromContract';
export { DummyFactory } from './dummy/dummyFactory';
export { Utils } from './utils';
export { BABYJUBJUB_SCALAR_FIELD } from './crypto/babyJubjub';
export { calcTransferProofBinding, calcWithdrawProofBinding } from './utils/ocashBindings';
export { App_ABI } from './abi/app';
export { ERC20_ABI } from './abi/erc20';
export { MemoryStore } from './store/memoryStore';
export { KeyValueStore, RedisStore, SqliteStore, type KeyValueStoreOptions, type RedisStoreOptions, type SqliteStoreOptions, type KeyValueClient } from './store/keyValueStore';
export {
  type StoredOperation,
  type OperationStatus,
  type OperationType,
  type OperationCreateInput,
  type ListOperationsQuery,
  type DepositOperation,
  type TransferOperation,
  type WithdrawOperation,
  type DepositOperationDetail,
  type TransferOperationDetail,
  type WithdrawOperationDetail,
} from './store/operationTypes';

import type { AssetsApi, CommitmentData, Hex, OCashSdk, OCashSdkConfig, SdkEvent, StorageAdapter } from './types';
import { defaultAssetsOverrideMainnet } from './assets/defaultAssetsOverride';
import { UniversalWasmBridge } from './runtime/wasmBridge';
import { SdkCore } from './core/sdk-core';
import { ProofEngine } from './proof/proofEngine';
import { MemoKit } from './memo/memoKit';
import { CryptoToolkit } from './crypto/cryptoToolkit';
import { KeyManager } from './crypto/keyManager';
import { DummyFactory } from './dummy/dummyFactory';
import { LedgerInfo } from './ledger/ledgerInfo';
import { Utils } from './utils';
import { MemoWorker } from './memo/worker';
import { MemoryStore } from './store/memoryStore';
import { WalletService } from './wallet/walletService';
import { SyncEngine } from './sync/syncEngine';
import { Planner } from './planner/planner';
import { TxBuilder } from './tx/txBuilder';
import { MerkleEngine } from './merkle/merkleEngine';
import { Ops } from './ops/ops';

function commitment(ro: CommitmentData, format: 'hex'): Hex;
function commitment(ro: CommitmentData, format: 'bigint'): bigint;
function commitment(ro: CommitmentData, format?: undefined): Hex;
function commitment(ro: CommitmentData, format?: 'hex' | 'bigint') {
  return format === 'bigint' ? CryptoToolkit.commitment(ro, 'bigint') : CryptoToolkit.commitment(ro, 'hex');
}

/**
 * Create an SDK instance with the given configuration.
 *
 * @example
 * ```ts
 * const sdk = createSdk({ chains: [...], onEvent: (e) => console.log(e) });
 * await sdk.core.ready();
 * await sdk.wallet.open({ seed: 'my-secret-seed' });
 * ```
 */
export const createSdk = (config: OCashSdkConfig): OCashSdk => {
  const normalizedConfig: OCashSdkConfig = {
    ...config,
    assetsOverride: config.assetsOverride ?? defaultAssetsOverrideMainnet,
  };
  const bridge = new UniversalWasmBridge({
    assetsOverride: normalizedConfig.assetsOverride,
    cacheDir: normalizedConfig.cacheDir,
    runtime: normalizedConfig.runtime,
  });

  const core = new SdkCore(normalizedConfig, bridge);
  const zkp = new ProofEngine(bridge, core);
  const dummy = new DummyFactory(bridge);
  const ledger = new LedgerInfo(normalizedConfig.chains ?? []);
  const memoWorker = new MemoWorker(normalizedConfig.memoWorker);
  const store: StorageAdapter = normalizedConfig.storage ?? new MemoryStore();
  const assetsApi: AssetsApi = {
    getChains: () => ledger.getChains(),
    getChain: (chainId: number) => ledger.getChain(chainId),
    getTokens: (chainId: number) => ledger.getTokens(chainId),
    getPoolInfo: (chainId: number, tokenId: string) => ledger.getPoolInfo(chainId, tokenId),
    getAllowanceTarget: (chainId: number) => ledger.getAllowanceTarget(chainId),
    appendTokens: (chainId: number, tokens) => ledger.appendTokens(chainId, tokens),
    loadFromUrl: (url: string) => ledger.loadFromUrl(url),
    getRelayerConfig: (chainId: number) => ledger.getRelayerConfig(chainId),
    syncRelayerConfig: (chainId: number) => ledger.syncRelayerConfig(chainId),
    syncAllRelayerConfigs: () => ledger.syncAllRelayerConfigs(),
  };

  const emit = (evt: SdkEvent) => core.emit(evt);

  const walletService = new WalletService(assetsApi, store, emit);
  const merkle = new MerkleEngine((chainId) => assetsApi.getChain(chainId), bridge, normalizedConfig.merkle, store);
  const syncEngine = new SyncEngine(assetsApi, store, walletService, emit, merkle, normalizedConfig.sync);
  const planner = new Planner(assetsApi, walletService, bridge);
  const tx = new TxBuilder();
  const ops = new Ops(assetsApi, planner, merkle, zkp, tx, walletService, store, emit);

  return {
    core: {
      ready: (cb) => core.ready(cb),
      reset: () => core.reset(),
      on: (type, handler) => core.on(type, handler as any),
      off: (type, handler) => core.off(type, handler as any),
    },
    crypto: {
      commitment,
      nullifier: (secret, commitment, freezerPk) => CryptoToolkit.nullifier(secret, commitment, freezerPk),
      createRecordOpening: (input) => CryptoToolkit.createRecordOpening(input),
      poolId: (token, viewerPk, freezerPk) => CryptoToolkit.poolId(token, viewerPk, freezerPk),
      viewingRandomness: () => CryptoToolkit.viewingRandomness(),
      memo: {
        createMemo: (ro) => MemoKit.createMemo(ro),
        memoNonce: (ephemeral, user) => MemoKit.memoNonce(ephemeral, user),
        decryptMemo: (secret, memo) => MemoKit.decryptMemo(secret, memo),
        decryptBatch: (requests) => memoWorker.decryptBatch(requests),
      },
      dummy: {
        createRecordOpening: () => dummy.createRecordOpening(),
        createInputSecret: () => dummy.createInputSecret(),
      },
      utils: {
        calcDepositFee: (amount, feeBps) => Utils.calcDepositFee(amount, feeBps),
        randomBytes32: () => Utils.randomBytes32(),
        randomBytes32Bigint: (scalar) => Utils.randomBytes32Bigint(scalar),
        serializeBigInt: (value) => Utils.serializeBigInt(value),
      },
    },
    keys: {
      deriveKeyPair: (seed, nonce) => KeyManager.deriveKeyPair(seed, nonce),
      getPublicKeyBySeed: (seed, nonce) => KeyManager.getPublicKeyBySeed(seed, nonce),
      getSecretKeyBySeed: (seed, nonce) => KeyManager.getSecretKeyBySeed(seed, nonce),
      userPkToAddress: (userPk) => KeyManager.userPkToAddress(userPk),
      addressToUserPk: (address) => KeyManager.addressToUserPk(address),
    },
    assets: {
      ...assetsApi,
    },
    storage: {
      getAdapter: () => store,
    },
    merkle,
    wallet: {
      open: (session) => walletService.open(session),
      close: () => walletService.close(),
      getUtxos: (query) => walletService.getUtxos(query),
      getBalance: (query) => walletService.getBalance(query),
      markSpent: (input) => walletService.markSpent(input),
    },
    sync: syncEngine,
    planner,
    zkp: {
      createWitnessTransfer: (input, context) => zkp.createWitnessTransfer(input, context),
      createWitnessWithdraw: (input, context) => zkp.createWitnessWithdraw(input, context),
      proveTransfer: (witness, context) => zkp.proveTransfer(witness, context),
      proveWithdraw: (witness, context) => zkp.proveWithdraw(witness, context),
    },
    tx,
    ops,
  };
};

const OcashSdk = {
  createSdk,
  MemoKit,
  CryptoToolkit,
  KeyManager,
  LedgerInfo,
  DummyFactory,
  Utils,
  MemoryStore,
} as const;

export default OcashSdk;
