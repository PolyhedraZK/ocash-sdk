import { createPublicClient, http, type Address, type PublicClient } from 'viem';
import { App_ABI } from '../abi/app';
import { ERC20_ABI } from '../abi/erc20';
import type {
  AssetsApi,
  CommitmentData,
  Hex,
  MerkleApi,
  OpsApi,
  OperationCreateInput,
  PlannerApi,
  RelayerRequest,
  SdkErrorCode,
  SdkEvent,
  TransferMergePlan,
  TransferPlan,
  TokenMetadata,
  TransferWitnessInput,
  TxBuilderApi,
  UserKeyPair,
  UserPublicKey,
  WithdrawPlan,
  WithdrawWitnessInput,
  WalletApi,
  ZkpApi,
} from '../types';
import { CryptoToolkit } from '../crypto/cryptoToolkit';
import { Utils } from '../utils';
import { MemoKit } from '../memo/memoKit';
import { SdkError } from '../errors';
import { RelayerClient } from './relayerClient';
import type { StorageAdapter } from '../types';
import { pickMerkleRootIndex } from './pickMerkleRootIndex';
import { isHexStrict } from '../utils/hex';

const ARRAY_HASH_SIZE = 2048n;
const NATIVE_ADDRESS = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE' as const;
const isHex = (value: unknown): value is Hex => isHexStrict(value);

const toFrPointJson = (input: [string, string]) => ({ X: BigInt(input[0]), Y: BigInt(input[1]) });
const toViewerPkJson = (input: [string, string]) => ({ EncryptionKey: { Key: toFrPointJson(input) } });
const toFreezerPkJson = (input: [string, string]) => ({ Point: toFrPointJson(input) });

const toBigintOrThrow = (value: unknown, input: { code: SdkErrorCode; name: string; detail: Record<string, unknown> }): bigint => {
  if (typeof value === 'bigint') return value;
  try {
    if (typeof value === 'string' && value.length) return BigInt(value);
    if (typeof value === 'number' && Number.isFinite(value)) return BigInt(value);
    return BigInt(value as any);
  } catch (error) {
    throw new SdkError(input.code, `Invalid ${input.name}`, { ...input.detail, value }, error);
  }
};

const buildTransferWitness = (input: { token: TokenMetadata; inputSecrets: any[]; outputs: any[]; array: any; relayerFee: bigint; proofBinding: string }): TransferWitnessInput => {
  const token = input.token;
  return {
    asset_id: token.id,
    asset_token_id: BigInt(token.wrappedErc20).toString(),
    asset_policy: {
      viewer_pk: toViewerPkJson(token.viewerPk),
      freezer_pk: toFreezerPkJson(token.freezerPk),
    },
    input_secrets: input.inputSecrets as any,
    array: input.array as any,
    fee: input.relayerFee,
    max_amount: token.transferMaxAmount
      ? toBigintOrThrow(token.transferMaxAmount, {
          code: 'CONFIG',
          name: 'token.transferMaxAmount',
          detail: { tokenId: token.id },
        })
      : 0n,
    output_record_openings: input.outputs as any,
    viewing_memo_randomness: Array.from(CryptoToolkit.viewingRandomness()),
    proof_binding: input.proofBinding,
  } as any;
};

const buildWithdrawWitness = (input: {
  token: TokenMetadata;
  inputSecret: any;
  outputRecordOpening: any;
  array: any;
  burnAmount: bigint;
  relayerFee: bigint;
  gasDropValue: bigint;
  proofBinding: string;
}): WithdrawWitnessInput => {
  const token = input.token;
  return {
    asset_id: token.id,
    asset_token_id: BigInt(token.wrappedErc20).toString(),
    asset_policy: {
      viewer_pk: toViewerPkJson(token.viewerPk),
      freezer_pk: toFreezerPkJson(token.freezerPk),
    },
    input_secret: input.inputSecret as any,
    output_record_opening: input.outputRecordOpening as any,
    array: input.array as any,
    amount: input.burnAmount,
    relayer_fee: input.relayerFee,
    gas_drop_value: input.gasDropValue,
    viewing_memo_randomness: Array.from(CryptoToolkit.viewingRandomness()),
    proof_binding: input.proofBinding,
  } as any;
};

export class Ops implements OpsApi {
  private readonly publicClients = new Map<number, PublicClient>();

  constructor(
    private readonly assets: AssetsApi,
    private readonly planner: PlannerApi,
    private readonly merkle: MerkleApi,
    private readonly zkp: ZkpApi,
    private readonly tx: TxBuilderApi,
    private readonly wallet: Pick<WalletApi, 'markSpent'>,
    private readonly store?: Pick<StorageAdapter, 'createOperation' | 'updateOperation'>,
    private readonly emit?: (evt: SdkEvent) => void,
  ) {}

  private debug(scope: string, message: string, detail?: Record<string, unknown>) {
    this.emit?.({ type: 'debug', payload: { scope, message, detail } } as any);
  }

  private emitOperationUpdate(payload: Extract<SdkEvent, { type: 'operations:update' }>['payload']) {
    this.emit?.({ type: 'operations:update', payload } as SdkEvent);
  }

  private getPublicClient(chainId: number): PublicClient {
    const cached = this.publicClients.get(chainId);
    if (cached) return cached;
    const chain = this.assets.getChain(chainId);
    if (!chain?.rpcUrl) {
      throw new SdkError('CONFIG', `chain ${chainId} missing rpcUrl`, { chainId });
    }
    const client = createPublicClient({ transport: http(chain.rpcUrl) }) as PublicClient;
    this.publicClients.set(chainId, client);
    return client;
  }

  private async timed<T>(scope: string, label: string, detail: Record<string, unknown>, fn: () => Promise<T>): Promise<T> {
    const startedAt = Date.now();
    this.debug(scope, `${label}:start`, detail);
    try {
      const result = await fn();
      this.debug(scope, `${label}:done`, { ...detail, costMs: Date.now() - startedAt });
      return result;
    } catch (error) {
      this.debug(scope, `${label}:error`, {
        ...detail,
        costMs: Date.now() - startedAt,
        error: error instanceof Error ? { name: error.name, message: error.message } : { message: String(error) },
      });
      throw error;
    }
  }

  private updateOperation(operationId: string | undefined, patch: Parameters<StorageAdapter['updateOperation']>[1]) {
    if (!operationId) return;
    try {
      this.store?.updateOperation(operationId, patch);
      this.emitOperationUpdate({ action: 'update', operationId, patch });
    } catch {
      // ignore operation store errors
    }
  }

  private async stage<T>(code: SdkErrorCode, message: string, detail: Record<string, unknown>, fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof SdkError) throw error;
      throw new SdkError(code, message, detail, error);
    }
  }

  private async prepareTransferFromPlan(input: { plan: TransferPlan; ownerKeyPair: UserKeyPair; publicClient: PublicClient }) {
    const scope = 'ops:prepareTransfer';
    const chain = this.assets.getChain(input.plan.chainId);
    if (!chain.ocashContractAddress) {
      throw new SdkError('CONFIG', `chain ${input.plan.chainId} missing ocashContractAddress`, { chainId: input.plan.chainId });
    }
    const contractAddress = chain.ocashContractAddress;

    const selected = input.plan.selectedInputs;
    if (!Array.isArray(selected) || !selected.length) {
      throw new SdkError('CONFIG', 'planner returned no selectedInputs', { chainId: input.plan.chainId, assetId: input.plan.assetId });
    }
    const token = input.plan.token as TokenMetadata;
    const relayerFee = BigInt(input.plan.relayerFee ?? 0n);
    const extraData = input.plan.extraData;
    const outputs = input.plan.outputs;
    const proofBinding = input.plan.proofBinding as string;

    const [array, digest, totalElements] = await this.timed(scope, 'readContract.state', { chainId: input.plan.chainId, contract: contractAddress }, () =>
      this.stage('CONFIG', 'prepareTransfer failed to read contract state', { chainId: input.plan.chainId, contract: contractAddress }, () =>
        Promise.all([
          input.publicClient.readContract({ address: contractAddress, abi: App_ABI, functionName: 'getArray', args: [] }),
          input.publicClient.readContract({ address: contractAddress, abi: App_ABI, functionName: 'digest', args: [] }),
          input.publicClient.readContract({
            address: contractAddress,
            abi: App_ABI,
            functionName: 'totalElements',
            args: [],
          }),
        ]),
      ),
    );

    const digestArrayHash = Array.isArray(digest) ? (digest as any)[1] : (digest as any)?.[1];
    const arrayHash = toBigintOrThrow(digestArrayHash, {
      code: 'CONFIG',
      name: 'digest[1] (array hash)',
      detail: { chainId: input.plan.chainId, contractAddress },
    });
    const totalElementsBig = toBigintOrThrow(totalElements, {
      code: 'CONFIG',
      name: 'totalElements',
      detail: { chainId: input.plan.chainId, contractAddress },
    });
    const arrayHashIndex = totalElementsBig > 0n ? Math.max(0, Number((((totalElementsBig - 1n) % ARRAY_HASH_SIZE) + ARRAY_HASH_SIZE) % ARRAY_HASH_SIZE)) : 0;

    const remote = await this.timed(scope, 'merkle.getProofByCids', { chainId: input.plan.chainId, cids: selected.map((u) => u.mkIndex) }, () =>
      this.stage('MERKLE', 'prepareTransfer merkle proof fetch failed', { chainId: input.plan.chainId, cids: selected.map((u) => u.mkIndex) }, () =>
        this.merkle.getProofByCids({ chainId: input.plan.chainId, cids: selected.map((u) => u.mkIndex), totalElements: totalElementsBig }),
      ),
    );
    const totalElementsInProof = (remote.latest_cid ?? 0) + 1;
    const mkRootIndex = this.merkle.currentMerkleRootIndex(totalElementsInProof);
    const merkleRootIndex = await this.timed(scope, 'pickMerkleRootIndex', { chainId: input.plan.chainId, currentIndex: mkRootIndex }, () =>
      this.stage('MERKLE', 'prepareTransfer failed to pick merkle root index', { chainId: input.plan.chainId, currentIndex: mkRootIndex }, () =>
        pickMerkleRootIndex({
          chainId: input.plan.chainId,
          publicClient: input.publicClient,
          contractAddress,
          currentIndex: mkRootIndex,
          remoteMerkleRoot: remote.merkle_root,
          onDebug: (event) => this.debug(scope, `pickMerkleRootIndex:${event.message}`, event.detail),
        }),
      ),
    );

    const witnessInputSecrets = await this.timed(scope, 'merkle.buildInputSecretsFromUtxos', { chainId: input.plan.chainId, count: selected.length }, () =>
      this.stage('WITNESS', 'prepareTransfer failed to build input secrets', { chainId: input.plan.chainId, count: selected.length }, () =>
        this.merkle.buildInputSecretsFromUtxos({
          remote,
          utxos: selected,
          ownerKeyPair: input.ownerKeyPair,
          arrayHash,
          totalElements: totalElementsBig,
          maxInputs: 3,
        }),
      ),
    );

    const witness = buildTransferWitness({
      token,
      inputSecrets: witnessInputSecrets,
      outputs: [...outputs],
      array,
      relayerFee,
      proofBinding,
    });

    const proof = await this.timed(scope, 'zkp.proveTransfer', { chainId: input.plan.chainId }, () =>
      this.stage('PROOF', 'prepareTransfer proof failed', { chainId: input.plan.chainId }, () =>
        this.zkp.proveTransfer(witness, {
          merkle_root_index: merkleRootIndex,
          array_hash_index: arrayHashIndex,
          relayer: input.plan.relayer,
          extra_data: extraData,
        }),
      ),
    );

    const request = await this.timed(scope, 'tx.buildTransferCalldata', { chainId: input.plan.chainId }, () =>
      this.stage('CONFIG', 'prepareTransfer tx request build failed', { chainId: input.plan.chainId }, () => this.tx.buildTransferCalldata({ chainId: input.plan.chainId, proof })),
    );
    this.debug(scope, 'done', { chainId: input.plan.chainId });
    return {
      plan: input.plan,
      witness,
      proof,
      request,
      meta: { arrayHashIndex, merkleRootIndex: merkleRootIndex, relayer: input.plan.relayer },
    };
  }

  async prepareTransfer(input: { chainId: number; assetId: string; amount: bigint; to: Hex; ownerKeyPair: UserKeyPair; publicClient: PublicClient; relayerUrl?: string; autoMerge?: boolean }) {
    const scope = 'ops:prepareTransfer';
    this.debug(scope, 'start', { chainId: input.chainId, assetId: input.assetId, to: input.to });
    const chain = this.assets.getChain(input.chainId);
    if (!chain.ocashContractAddress) {
      throw new SdkError('CONFIG', `chain ${input.chainId} missing ocashContractAddress`, { chainId: input.chainId });
    }
    const relayerUrl = input.relayerUrl ?? chain.relayerUrl;
    if (!relayerUrl) throw new SdkError('CONFIG', `chain ${input.chainId} missing relayerUrl`, { chainId: input.chainId });

    const plan = await this.timed(scope, 'planner.plan', { chainId: input.chainId, assetId: input.assetId, relayerUrl }, () =>
      this.stage('CONFIG', 'prepareTransfer planner failed', { chainId: input.chainId, assetId: input.assetId }, () =>
        this.planner.plan({
          action: 'transfer',
          chainId: input.chainId,
          assetId: input.assetId,
          amount: input.amount,
          to: input.to,
          relayerUrl,
          autoMerge: input.autoMerge,
        }),
      ),
    );
    const planAction = plan?.action;
    if (planAction && planAction !== 'transfer' && planAction !== 'transfer-merge') {
      throw new SdkError('CONFIG', 'planner returned non-transfer plan', { chainId: input.chainId, assetId: input.assetId, action: planAction });
    }

    if (planAction === 'transfer-merge') {
      const typedPlan = plan as TransferMergePlan;
      const prepared = await this.prepareTransferFromPlan({
        plan: typedPlan.mergePlan,
        ownerKeyPair: input.ownerKeyPair,
        publicClient: input.publicClient,
      });
      return {
        kind: 'merge' as const,
        plan: typedPlan,
        merge: prepared,
        nextInput: {
          chainId: input.chainId,
          assetId: input.assetId,
          amount: input.amount,
          to: input.to,
          relayerUrl,
          autoMerge: input.autoMerge,
        },
      };
    }

    const typedPlan = plan as TransferPlan;
    const prepared = await this.prepareTransferFromPlan({
      plan: typedPlan,
      ownerKeyPair: input.ownerKeyPair,
      publicClient: input.publicClient,
    });
    return { kind: 'transfer' as const, ...prepared };
  }

  async prepareWithdraw(input: {
    chainId: number;
    assetId: string;
    amount: bigint;
    recipient: Address;
    ownerKeyPair: UserKeyPair;
    publicClient: PublicClient;
    gasDropValue?: bigint;
    relayerUrl?: string;
  }) {
    const scope = 'ops:prepareWithdraw';
    this.debug(scope, 'start', { chainId: input.chainId, assetId: input.assetId, recipient: input.recipient });
    const chain = this.assets.getChain(input.chainId);
    if (!chain.ocashContractAddress) {
      throw new SdkError('CONFIG', `chain ${input.chainId} missing ocashContractAddress`, { chainId: input.chainId });
    }
    const relayerUrl = input.relayerUrl ?? chain.relayerUrl;
    if (!relayerUrl) throw new SdkError('CONFIG', `chain ${input.chainId} missing relayerUrl`, { chainId: input.chainId });
    const contractAddress = chain.ocashContractAddress;

    const gasDropValue = input.gasDropValue ?? 0n;

    const plan = await this.timed(scope, 'planner.plan', { chainId: input.chainId, assetId: input.assetId, relayerUrl }, () =>
      this.stage('CONFIG', 'prepareWithdraw planner failed', { chainId: input.chainId, assetId: input.assetId }, () =>
        this.planner.plan({
          action: 'withdraw',
          chainId: input.chainId,
          assetId: input.assetId,
          amount: input.amount,
          recipient: input.recipient,
          gasDropValue,
          relayerUrl,
        }),
      ),
    );
    const planAction = (plan as any)?.action;
    if (planAction && planAction !== 'withdraw') {
      throw new SdkError('CONFIG', 'planner returned non-withdraw plan', { chainId: input.chainId, assetId: input.assetId, action: planAction });
    }

    const typedPlan = plan as WithdrawPlan;
    const token = typedPlan.token as TokenMetadata;
    const relayerFee = BigInt(typedPlan.relayerFee ?? 0n);
    const burnAmount = BigInt(typedPlan.burnAmount ?? input.amount);
    const utxo = typedPlan.selectedInput as any;
    if (!utxo) {
      throw new SdkError('CONFIG', 'planner returned no selectedInput', {
        chainId: input.chainId,
        assetId: input.assetId,
        burnAmount: burnAmount.toString(),
      });
    }

    const outputRo = typedPlan.outputRecordOpening as any;
    const extraData = typedPlan.extraData as any;
    const proofBinding = typedPlan.proofBinding as string;

    const [array, digest, totalElements] = await this.timed(scope, 'readContract.state', { chainId: input.chainId, contract: contractAddress }, () =>
      this.stage('CONFIG', 'prepareWithdraw failed to read contract state', { chainId: input.chainId, contract: contractAddress }, () =>
        Promise.all([
          (input.publicClient.readContract as any)({ address: contractAddress, abi: App_ABI as any, functionName: 'getArray', args: [] }),
          (input.publicClient.readContract as any)({ address: contractAddress, abi: App_ABI as any, functionName: 'digest', args: [] }),
          (input.publicClient.readContract as any)({
            address: contractAddress,
            abi: App_ABI as any,
            functionName: 'totalElements',
            args: [],
          }),
        ]),
      ),
    );
    const digestArrayHash = Array.isArray(digest) ? (digest as any)[1] : (digest as any)?.[1];
    const arrayHash = toBigintOrThrow(digestArrayHash, {
      code: 'CONFIG',
      name: 'digest[1] (array hash)',
      detail: { chainId: input.chainId, contractAddress },
    });
    const totalElementsBig = toBigintOrThrow(totalElements, {
      code: 'CONFIG',
      name: 'totalElements',
      detail: { chainId: input.chainId, contractAddress },
    });
    const arrayHashIndex = totalElementsBig > 0n ? Math.max(0, Number((((totalElementsBig - 1n) % ARRAY_HASH_SIZE) + ARRAY_HASH_SIZE) % ARRAY_HASH_SIZE)) : 0;

    const remote = await this.timed(scope, 'merkle.getProofByCids', { chainId: input.chainId, cids: [utxo.mkIndex] }, () =>
      this.stage('MERKLE', 'prepareWithdraw merkle proof fetch failed', { chainId: input.chainId, cids: [utxo.mkIndex] }, () =>
        this.merkle.getProofByCids({ chainId: input.chainId, cids: [utxo.mkIndex], totalElements: totalElementsBig }),
      ),
    );
    const totalElementsInProof = (remote.latest_cid ?? 0) + 1;
    const mkRootIndex = this.merkle.currentMerkleRootIndex(totalElementsInProof);
    const merkleRootIndex = await this.timed(scope, 'pickMerkleRootIndex', { chainId: input.chainId, currentIndex: mkRootIndex }, () =>
      this.stage('MERKLE', 'prepareWithdraw failed to pick merkle root index', { chainId: input.chainId, currentIndex: mkRootIndex }, () =>
        pickMerkleRootIndex({
          chainId: input.chainId,
          publicClient: input.publicClient,
          contractAddress,
          currentIndex: mkRootIndex,
          remoteMerkleRoot: remote.merkle_root,
          onDebug: (event) => this.debug(scope, `pickMerkleRootIndex:${event.message}`, event.detail),
        }),
      ),
    );

    const [inputSecret] = await this.timed(scope, 'merkle.buildInputSecretsFromUtxos', { chainId: input.chainId, assetId: input.assetId }, () =>
      this.stage('WITNESS', 'prepareWithdraw failed to build input secrets', { chainId: input.chainId, assetId: input.assetId }, () =>
        this.merkle.buildInputSecretsFromUtxos({
          remote,
          utxos: [utxo],
          ownerKeyPair: input.ownerKeyPair,
          arrayHash,
          totalElements: totalElementsBig,
        }),
      ),
    );
    if (!inputSecret) {
      throw new SdkError('WITNESS', 'failed to build inputSecret', { chainId: input.chainId, assetId: input.assetId });
    }

    const witness = buildWithdrawWitness({
      token,
      inputSecret,
      outputRecordOpening: outputRo,
      array,
      burnAmount,
      relayerFee,
      gasDropValue,
      proofBinding,
    });

    const proof = await this.timed(scope, 'zkp.proveWithdraw', { chainId: input.chainId }, () =>
      this.stage('PROOF', 'prepareWithdraw proof failed', { chainId: input.chainId }, () =>
        this.zkp.proveWithdraw(witness as any, {
          merkle_root_index: merkleRootIndex,
          array_hash_index: arrayHashIndex,
          relayer: typedPlan.relayer,
          recipient: input.recipient,
          withdraw_amount: burnAmount,
          relayer_fee: relayerFee,
          gas_drop_value: gasDropValue,
          extra_data: extraData,
        }),
      ),
    );

    const request = await this.timed(scope, 'tx.buildWithdrawCalldata', { chainId: input.chainId }, () =>
      this.stage('CONFIG', 'prepareWithdraw tx request build failed', { chainId: input.chainId }, () => this.tx.buildWithdrawCalldata({ chainId: input.chainId, proof })),
    );
    this.debug(scope, 'done', { chainId: input.chainId });
    return {
      plan: typedPlan,
      witness,
      proof,
      request,
      meta: { arrayHashIndex, merkleRootIndex: merkleRootIndex, relayer: typedPlan.relayer },
    };
  }

  private buildOperationFromPlan(plan: TransferPlan | WithdrawPlan): OperationCreateInput {
    if (plan.action === 'transfer') {
      const inputCommitments = plan.selectedInputs.map((u) => u.commitment);
      const outputCommitments = plan.outputs.filter((o) => o.asset_amount > 0n).map((o) => CryptoToolkit.commitment(o, 'hex') as Hex);
      return {
        type: 'transfer',
        chainId: plan.chainId,
        tokenId: plan.assetId,
        detail: {
          token: plan.token.symbol,
          amount: plan.requestedAmount.toString(),
          fee: plan.relayerFee.toString(),
          relayerFeeTotal: plan.feeSummary.relayerFeeTotal.toString(),
          protocolFeeTotal: plan.feeSummary.protocolFeeTotal.toString(),
          mergeCount: plan.feeSummary.mergeCount,
          feeCount: plan.feeSummary.feeCount,
          to: plan.to,
          inputCommitments,
          outputCommitments,
        },
      };
    }

    const inputCommitments = [plan.selectedInput.commitment];
    const outputCommitments = plan.outputRecordOpening.asset_amount > 0n ? [CryptoToolkit.commitment(plan.outputRecordOpening, 'hex') as Hex] : [];
    return {
      type: 'withdraw',
      chainId: plan.chainId,
      tokenId: plan.assetId,
      detail: {
        token: plan.token.symbol,
        amount: plan.requestedAmount.toString(),
        burnAmount: plan.burnAmount.toString(),
        protocolFee: plan.protocolFee.toString(),
        relayerFee: plan.relayerFee.toString(),
        relayerFeeTotal: plan.feeSummary.relayerFeeTotal.toString(),
        protocolFeeTotal: plan.feeSummary.protocolFeeTotal.toString(),
        mergeCount: plan.feeSummary.mergeCount,
        feeCount: plan.feeSummary.feeCount,
        recipient: plan.recipient,
        inputCommitments,
        outputCommitments,
      },
    };
  }

  async submitRelayerRequest<T = unknown>(input: {
    prepared: { plan: TransferPlan | WithdrawPlan; request: RelayerRequest; kind?: 'transfer' | 'merge' };
    relayerUrl?: string;
    signal?: AbortSignal;
    operationId?: string;
    operation?: OperationCreateInput;
    publicClient?: PublicClient;
    relayerTimeoutMs?: number;
    relayerIntervalMs?: number;
    receiptTimeoutMs?: number;
    receiptPollIntervalMs?: number;
    confirmations?: number;
  }): Promise<{
    result: T;
    operationId?: string;
    updateOperation: (patch: Parameters<StorageAdapter['updateOperation']>[1]) => void;
    waitRelayerTxHash: Promise<Hex>;
    transactionReceipt?: Promise<Awaited<ReturnType<PublicClient['waitForTransactionReceipt']>>>;
    TransactionReceipt?: Promise<Awaited<ReturnType<PublicClient['waitForTransactionReceipt']>>>;
  }> {
    const prepared = input.prepared;
    if (prepared?.kind === 'merge') {
      throw new SdkError('CONFIG', 'submitRelayerRequest does not accept merge plan; submit merge request first', { action: 'transfer-merge' });
    }

    const plan = prepared?.plan;
    const relayerUrl = input.relayerUrl ?? plan?.relayerUrl ?? (plan ? this.assets.getChain(plan.chainId).relayerUrl : undefined);
    if (!relayerUrl) {
      const chainId = plan?.chainId;
      throw new SdkError('CONFIG', `chain ${chainId ?? 'unknown'} missing relayerUrl`, { chainId });
    }
    const request = prepared.request;
    const client = new RelayerClient(relayerUrl);
    const requestUrl = `${relayerUrl.replace(/\/$/, '')}${request.path}`;

    let operationId = input.operationId;
    const operation = input.operation ?? (plan ? this.buildOperationFromPlan(plan) : undefined);
    if (!operationId && operation) {
      const created = this.store?.createOperation(operation as any);
      if (created) this.emitOperationUpdate({ action: 'create', operation: created });
      operationId = created?.id ?? operationId;
    }
    try {
      const result = await client.submit<T>(request, { signal: input.signal });
      this.updateOperation(operationId, {
        status: 'submitted',
        requestUrl,
        relayerTxHash: isHex(result) ? (result as Hex) : undefined,
      });
      const updateOperation = (patch: Parameters<StorageAdapter['updateOperation']>[1]) => {
        this.updateOperation(operationId, patch);
      };
      const waitRelayerTxHash = (() => {
        const relayerTxHash = isHex(result) ? (result as Hex) : undefined;
        if (!relayerTxHash) {
          return Promise.reject(new SdkError('RELAYER', 'relayerTxHash unavailable', { relayerUrl, requestUrl }));
        }
        return this.waitRelayerTxHash({
          relayerUrl,
          relayerTxHash,
          timeoutMs: input.relayerTimeoutMs,
          intervalMs: input.relayerIntervalMs,
          signal: input.signal,
          operationId,
          requestUrl,
        });
      })();
      waitRelayerTxHash.catch(() => {});
      const receiptClient = input.publicClient ?? (plan ? this.getPublicClient(plan.chainId) : undefined);
      const transactionReceipt = receiptClient
        ? waitRelayerTxHash.then((txHash) =>
            this.waitForTransactionReceipt({
              publicClient: receiptClient,
              txHash,
              timeoutMs: input.receiptTimeoutMs,
              pollIntervalMs: input.receiptPollIntervalMs,
              confirmations: input.confirmations,
              operationId,
            }),
          )
        : undefined;
      const planForReceipt = plan as TransferPlan | WithdrawPlan | undefined;
      let autoMarkReceipt = transactionReceipt;
      if (transactionReceipt && planForReceipt) {
        const getNullifiers = (planInput: TransferPlan | WithdrawPlan) => {
          if (planInput.action === 'transfer') {
            return planInput.selectedInputs.map((u) => u.nullifier);
          }
          const nullifier = planInput.selectedInput?.nullifier;
          return nullifier ? [nullifier] : [];
        };
        autoMarkReceipt = transactionReceipt.then(async (receipt) => {
          if (receipt?.status === 'success') {
            const nullifiers = getNullifiers(planForReceipt);
            if (nullifiers.length) {
              try {
                await this.wallet.markSpent({ chainId: planForReceipt.chainId, nullifiers });
              } catch (error) {
                this.debug('ops:autoMarkSpent', 'markSpent failed', {
                  chainId: planForReceipt.chainId,
                  error: error instanceof Error ? error.message : String(error),
                });
              }
            }
          }
          return receipt;
        });
      }
      transactionReceipt?.catch(() => {});
      autoMarkReceipt?.catch(() => {});
      return {
        result,
        operationId,
        updateOperation,
        waitRelayerTxHash,
        transactionReceipt: autoMarkReceipt,
        TransactionReceipt: autoMarkReceipt,
      };
    } catch (error) {
      if (error instanceof SdkError) {
        if (error.code === 'RELAYER') {
          this.updateOperation(operationId, { status: 'failed', error: error.message, requestUrl });
          throw new SdkError('RELAYER', error.message, { ...(error.detail as any), relayerUrl, request }, error);
        }
        this.updateOperation(operationId, { status: 'failed', error: error.message, requestUrl });
        throw error;
      }
      this.updateOperation(operationId, {
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
        requestUrl,
      });
      throw new SdkError('RELAYER', 'Relayer request failed', { relayerUrl, request }, error);
    }
  }

  async prepareDeposit(input: { chainId: number; assetId: string; amount: bigint; ownerPublicKey: UserPublicKey; account: Address; publicClient: PublicClient }): Promise<{
    chainId: number;
    assetId: string;
    amount: bigint;
    token: TokenMetadata;
    recordOpening: CommitmentData;
    memo: Hex;
    protocolFee: bigint;
    payAmount: bigint;
    depositRelayerFee: bigint;
    value: bigint;
    approveNeeded: boolean;
    approveRequest?: {
      chainId: number;
      address: Address;
      abi: any;
      functionName: 'approve';
      args: [Address, bigint];
    };
    depositRequest: {
      chainId: number;
      address: Address;
      abi: any;
      functionName: 'deposit';
      args: [bigint, bigint, [bigint, bigint], bigint, Hex];
      value: bigint;
    };
  }> {
    const chain = this.assets.getChain(input.chainId);
    if (!chain.ocashContractAddress) {
      throw new SdkError('CONFIG', `chain ${input.chainId} missing ocashContractAddress`, { chainId: input.chainId });
    }
    const contractAddress = chain.ocashContractAddress;

    const token = this.assets.getPoolInfo(input.chainId, input.assetId);
    if (!token) {
      throw new SdkError('CONFIG', `token ${input.assetId} not found in chain ${input.chainId}`, {
        chainId: input.chainId,
        assetId: input.assetId,
      });
    }

    const protocolFee = Utils.calcDepositFee(input.amount, token.depositFeeBps);
    const payAmount = input.amount + protocolFee;

    const depositRelayerFee = (await this.stage(
      'CONFIG',
      'prepareDeposit failed to read depositRelayerFee',
      { chainId: input.chainId, contract: contractAddress },
      () =>
        (input.publicClient.readContract as any)({
          address: contractAddress,
          abi: App_ABI as any,
          functionName: 'depositRelayerFee',
          args: [],
        }) as any,
    )) as unknown as bigint;

    const userAddress = input.ownerPublicKey.user_pk.user_address;
    const userPK: [bigint, bigint] = [BigInt(userAddress[0]), BigInt(userAddress[1])];

    const recordOpening = CryptoToolkit.createRecordOpening({
      asset_id: BigInt(token.id),
      asset_amount: input.amount,
      user_pk: { user_address: userPK },
    });

    const memo = MemoKit.createMemo(recordOpening);

    const isNative = token.wrappedErc20.toLowerCase() === NATIVE_ADDRESS.toLowerCase();
    const value = isNative ? payAmount + depositRelayerFee : depositRelayerFee;

    const depositArgs: [bigint, bigint, [bigint, bigint], bigint, Hex] = [BigInt(token.id), input.amount, userPK, recordOpening.blinding_factor, memo];

    const depositRequest = {
      chainId: input.chainId,
      address: contractAddress,
      abi: App_ABI as any,
      functionName: 'deposit' as const,
      args: depositArgs,
      value,
    };

    if (isNative) {
      return {
        chainId: input.chainId,
        assetId: input.assetId,
        amount: input.amount,
        token,
        recordOpening,
        memo,
        protocolFee,
        payAmount,
        depositRelayerFee,
        value,
        approveNeeded: false,
        depositRequest,
      };
    }

    const allowance = (await this.stage(
      'CONFIG',
      'prepareDeposit failed to read ERC20 allowance',
      { chainId: input.chainId, token: token.wrappedErc20, account: input.account, spender: contractAddress },
      () =>
        (input.publicClient.readContract as any)({
          address: token.wrappedErc20,
          abi: ERC20_ABI as any,
          functionName: 'allowance',
          args: [input.account, contractAddress],
        }) as any,
    )) as unknown as bigint;

    const approveNeeded = allowance < payAmount;
    const approveRequest = approveNeeded
      ? {
          chainId: input.chainId,
          address: token.wrappedErc20,
          abi: ERC20_ABI as any,
          functionName: 'approve' as const,
          args: [contractAddress, payAmount] as [Address, bigint],
        }
      : undefined;

    return {
      chainId: input.chainId,
      assetId: input.assetId,
      amount: input.amount,
      token,
      recordOpening,
      memo,
      protocolFee,
      payAmount,
      depositRelayerFee,
      value,
      approveNeeded,
      approveRequest,
      depositRequest,
    };
  }

  async submitDeposit(input: {
    prepared: Awaited<ReturnType<Ops['prepareDeposit']>>;
    walletClient: { writeContract: (request: { address: Address; abi: any; functionName: string; args: any; value?: bigint; chainId?: number }) => Promise<Hex> };
    publicClient: PublicClient;
    autoApprove?: boolean;
    confirmations?: number;
    operationId?: string;
  }): Promise<{ txHash: Hex; approveTxHash?: Hex; receipt?: Awaited<ReturnType<PublicClient['waitForTransactionReceipt']>>; operationId?: string }> {
    const prepared = input.prepared;
    const outputCommitments = [CryptoToolkit.commitment(prepared.recordOpening, 'hex') as Hex];
    let operationId = input.operationId;
    if (!operationId) {
      const created = this.store?.createOperation({
        type: 'deposit',
        chainId: prepared.chainId,
        tokenId: prepared.assetId,
        detail: {
          token: prepared.token.symbol,
          amount: prepared.amount.toString(),
          protocolFee: prepared.protocolFee.toString(),
          depositRelayerFee: prepared.depositRelayerFee.toString(),
          outputCommitments,
        },
      } as any);
      if (created) this.emitOperationUpdate({ action: 'create', operation: created });
      operationId = created?.id ?? operationId;
    }

    let approveTxHash: Hex | undefined;
    if (input.autoApprove && prepared.approveNeeded && prepared.approveRequest) {
      approveTxHash = await input.walletClient.writeContract(prepared.approveRequest as any);
      await input.publicClient.waitForTransactionReceipt({ hash: approveTxHash });
    }

    const txHash = await input.walletClient.writeContract(prepared.depositRequest as any);
    this.updateOperation(operationId, { status: 'submitted', txHash });

    const receipt = await input.publicClient.waitForTransactionReceipt({
      hash: txHash,
      confirmations: input.confirmations,
    });
    this.updateOperation(operationId, { status: receipt.status === 'success' ? 'confirmed' : 'failed' });

    return { txHash, approveTxHash, receipt, operationId };
  }

  async waitRelayerTxHash(input: { relayerUrl: string; relayerTxHash: Hex; timeoutMs?: number; intervalMs?: number; signal?: AbortSignal; operationId?: string; requestUrl?: string }): Promise<Hex> {
    const timeoutMs = input.timeoutMs ?? 120_000;
    const intervalMs = input.intervalMs ?? 2_000;
    const client = new RelayerClient(input.relayerUrl);
    const requestUrl = input.requestUrl ?? input.relayerUrl;
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      if (input.signal?.aborted) {
        this.updateOperation(input.operationId, { status: 'failed', error: 'waitRelayerTxHash aborted', requestUrl });
        throw new SdkError('RELAYER', 'waitRelayerTxHash aborted', { relayerUrl: input.relayerUrl, relayerTxHash: input.relayerTxHash }, (input.signal as any).reason);
      }
      let txhash: Hex | null;
      try {
        txhash = await client.getTxHash({ relayerTxHash: input.relayerTxHash, signal: input.signal });
      } catch (error) {
        this.updateOperation(input.operationId, {
          status: 'failed',
          error: error instanceof Error ? error.message : 'waitRelayerTxHash polling failed',
          requestUrl,
        });
        throw new SdkError('RELAYER', 'waitRelayerTxHash polling failed', { relayerUrl: input.relayerUrl, relayerTxHash: input.relayerTxHash }, error);
      }
      if (txhash) {
        this.updateOperation(input.operationId, { status: 'submitted', txHash: txhash, requestUrl });
        return txhash;
      }
      await new Promise((r) => setTimeout(r, intervalMs));
    }
    this.updateOperation(input.operationId, { status: 'failed', error: 'waitRelayerTxHash timeout', requestUrl });
    throw new SdkError('RELAYER', 'waitRelayerTxHash timeout', { relayerUrl: input.relayerUrl, relayerTxHash: input.relayerTxHash });
  }

  async waitForTransactionReceipt(input: {
    publicClient: PublicClient;
    txHash: Hex;
    timeoutMs?: number;
    pollIntervalMs?: number;
    confirmations?: number;
    operationId?: string;
  }): Promise<Awaited<ReturnType<PublicClient['waitForTransactionReceipt']>>> {
    try {
      const receipt = await input.publicClient.waitForTransactionReceipt({
        hash: input.txHash,
        timeout: input.timeoutMs,
        pollingInterval: input.pollIntervalMs,
        confirmations: input.confirmations,
      });
      if (receipt.status === 'success') {
        this.updateOperation(input.operationId, { status: 'confirmed', txHash: input.txHash });
      } else {
        this.updateOperation(input.operationId, { status: 'failed', txHash: input.txHash, error: 'transaction reverted' });
      }
      return receipt;
    } catch (error) {
      this.updateOperation(input.operationId, {
        status: 'failed',
        txHash: input.txHash,
        error: error instanceof Error ? error.message : 'waitForTransactionReceipt failed',
      });
      throw new SdkError('RELAYER', 'waitForTransactionReceipt failed', { txHash: input.txHash }, error);
    }
  }
}
