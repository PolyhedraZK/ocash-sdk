import { maxUint256, toHex } from 'viem';
import type {
  AssetsApi,
  CommitmentData,
  PlannerApi,
  PlannerFeeSummary,
  PlannerMaxEstimateResult,
  TransferPlan,
  RelayerConfig,
  TokenMetadata,
  UtxoRecord,
} from '../types';
import { SdkError } from '../errors';
import { KeyManager } from '../crypto/keyManager';
import { CryptoToolkit } from '../crypto/cryptoToolkit';
import type { WalletService } from '../wallet/walletService';
import type { ProofBridge } from '../types';
import { MemoKit } from '../memo/memoKit';
import { calcTransferProofBinding, calcWithdrawProofBinding } from '../utils/ocashBindings';
import { isHexStrict } from '../utils/hex';
import { fetchRelayerConfigFromRelayerUrl } from '../ledger/relayerConfig';

type PlanTransferInput = {
  action: 'transfer';
  chainId: number;
  assetId: string;
  amount: bigint;
  to: `0x${string}`;
  payIncludesFee?: boolean;
  relayerUrl?: string;
  autoMerge?: boolean;
};

type PlanWithdrawInput = {
  action: 'withdraw';
  chainId: number;
  assetId: string;
  amount: bigint;
  recipient: `0x${string}`;
  gasDropValue?: bigint;
  payIncludesFee?: boolean;
  relayerUrl?: string;
};

type PlanInput = PlanTransferInput | PlanWithdrawInput;

const requireHex = (value: unknown, name: string): `0x${string}` => {
  if (isHexStrict(value, { minBytes: 1 })) return value as `0x${string}`;
  throw new SdkError('CONFIG', `${name} must be a hex string starting with 0x`);
};

const parsePlanInput = (input: Record<string, unknown>): PlanInput => {
  const action = input.action;
  if (action !== 'transfer' && action !== 'withdraw') {
    throw new SdkError('CONFIG', 'Planner.plan requires action=transfer|withdraw');
  }
  const chainId = input.chainId;
  if (typeof chainId !== 'number' || !Number.isFinite(chainId)) throw new SdkError('CONFIG', 'Planner.plan requires chainId');
  const assetId = input.assetId;
  if (typeof assetId !== 'string' || !assetId) throw new SdkError('CONFIG', 'Planner.plan requires assetId');
  const amount = input.amount;
  if (typeof amount !== 'bigint') throw new SdkError('CONFIG', 'Planner.plan requires amount as bigint');
  const payIncludesFee = input.payIncludesFee === null ? undefined : input.payIncludesFee;
  if (payIncludesFee != null && typeof payIncludesFee !== 'boolean') throw new SdkError('CONFIG', 'payIncludesFee must be boolean');
  const relayerUrl = input.relayerUrl;
  if (relayerUrl != null && (typeof relayerUrl !== 'string' || !relayerUrl.length)) {
    throw new SdkError('CONFIG', 'relayerUrl must be a non-empty string');
  }
  const autoMerge = input.autoMerge === null ? undefined : input.autoMerge;
  if (autoMerge != null && typeof autoMerge !== 'boolean') throw new SdkError('CONFIG', 'autoMerge must be boolean');

  if (action === 'transfer') {
    const to = requireHex(input.to, 'Planner.plan(transfer).to');
    return { action, chainId, assetId, amount, to, payIncludesFee, relayerUrl: relayerUrl ?? undefined, autoMerge };
  }

  const recipient = requireHex(input.recipient, 'Planner.plan(withdraw).recipient');
  const gasDropValue = input.gasDropValue === null ? undefined : input.gasDropValue;
  if (gasDropValue != null && typeof gasDropValue !== 'bigint') throw new SdkError('CONFIG', 'gasDropValue must be bigint');
  return { action, chainId, assetId, amount, recipient, gasDropValue, payIncludesFee, relayerUrl: relayerUrl ?? undefined };
};

// Relayer config fee map keys are serialized as 32-byte B256 hex strings.
// Use `size: 32` to match the relayer's canonical key format (leading zeros included).
const tokenFeeKey = (token: TokenMetadata) => toHex(BigInt(token.id), { size: 32 }).toLowerCase();

const selectTransferInputs = (utxos: UtxoRecord[], required: bigint, maxInputs = 3) => {
  const sorted = [...utxos].sort((a, b) => Number(b.amount - a.amount));
  const selected: UtxoRecord[] = [];
  let sum = 0n;
  for (const utxo of sorted) {
    selected.push(utxo);
    sum += utxo.amount;
    if (selected.length >= maxInputs || sum >= required) break;
  }
  return { selected, sum };
};

const selectWithdrawInput = (utxos: UtxoRecord[], required: bigint) => {
  const sorted = [...utxos].sort((a, b) => Number(b.amount - a.amount));
  return sorted.find((u) => u.amount >= required) ?? null;
};

const INPUT_NUMBER = 3;

const recordsFee = (
  input: { withdrawFeeBps?: number },
  records: bigint[],
  expectedOutput: bigint,
  action: 'transfer' | 'withdraw',
  relayerFee: { transfer: bigint; withdraw: bigint },
  expectedIsWithFee?: boolean,
) => {
  let feeCount = 0;
  let fee = 0n;
  let cost = 0n;
  let total = 0n;
  let relayFee = 0n;
  let protocolFee = 0n;
  let outputAmount = 0n;

  while (records.length > 0) {
    feeCount++;
    const moreThenInputs = records.length > INPUT_NUMBER;
    const burnMoreThenInputs = action === 'withdraw' && records.length > 1;
    if (moreThenInputs || burnMoreThenInputs) {
      const merges = records.splice(0, INPUT_NUMBER);
      const mergeTotal = merges.reduce((acc, cur) => acc + cur, 0n);
      records.push(mergeTotal);
      continue;
    }

    if (action === 'transfer') {
      total = records.reduce((acc, cur) => acc + cur, 0n);
      fee = BigInt(feeCount) * relayerFee.transfer;
      relayFee = fee;
      if (maxUint256 === expectedOutput) {
        cost = total;
        outputAmount = total - fee;
        if (outputAmount < 0n) {
          outputAmount = 0n;
          cost = 0n;
        }
      } else {
        cost = expectedIsWithFee ? expectedOutput : expectedOutput + fee;
      }
      if (total < cost) {
        cost = 0n;
      }
      break;
    }

    if (action === 'withdraw') {
      const relayFeePay = relayerFee.withdraw;
      const withdrawFeeBps = BigInt(input.withdrawFeeBps ?? 0);
      const bpsBase = 10000n;
      const withdrawFeeDenominator = bpsBase + withdrawFeeBps;
      total = records.reduce((acc, cur) => acc + cur, 0n);
      fee = BigInt(feeCount - 1) * relayerFee.transfer;
      if (maxUint256 === expectedOutput) {
        const withdrawBase = ((total - fee) * bpsBase) / withdrawFeeDenominator;
        outputAmount = withdrawBase - relayFeePay;
        relayFee = fee + relayFeePay;
        if (outputAmount < 0n) {
          outputAmount = 0n;
          cost = 0n;
          break;
        }
        protocolFee = (withdrawBase * withdrawFeeBps) / bpsBase;
        const burnFee = protocolFee + relayFeePay;
        fee += burnFee;
        cost = outputAmount + fee;
        if (cost > total) {
          cost = 0n;
        }
      } else {
        if (expectedOutput > total) {
          cost = 0n;
          break;
        }
        relayFee = fee + relayFeePay;
        if (expectedIsWithFee) {
          const withdrawBase = ((expectedOutput - fee) * bpsBase) / withdrawFeeDenominator;
          outputAmount = withdrawBase - relayFeePay;
        } else {
          outputAmount = expectedOutput;
        }
        if (outputAmount < 0n) {
          cost = 0n;
          break;
        }
        const withdrawBase = outputAmount + relayFeePay;
        protocolFee = (withdrawBase * withdrawFeeBps) / bpsBase;
        const burnFee = protocolFee + relayFeePay;
        fee += burnFee;
        cost = outputAmount + fee;
        if (cost > total) {
          cost = 0n;
        }
      }
      break;
    }
  }

  return {
    total,
    fee,
    feeCount,
    cost,
    outputAmount,
    relayFee,
    protocolFee,
  };
};

const buildFeeSummary = (info: ReturnType<typeof recordsFee>, inputCount: number): PlannerFeeSummary => {
  return {
    mergeCount: Math.max(0, info.feeCount - 1),
    feeCount: info.feeCount,
    relayerFeeTotal: info.relayFee,
    protocolFeeTotal: info.protocolFee,
    totalInput: info.total,
    outputAmount: info.outputAmount,
    cost: info.cost,
    inputCount,
  };
};

const estimateRecords = (input: {
  records: bigint[];
  expectedOutput: bigint;
  action: 'transfer' | 'withdraw';
  relayerFee: { transfer: bigint; withdraw: bigint };
  withdrawFeeBps?: number;
  expectedIsWithFee?: boolean;
}) => {
  const sorted = [...input.records].sort((a, b) => Number(b - a));
  const payRecords: bigint[] = [];
  let payInfo = recordsFee(
    { withdrawFeeBps: input.withdrawFeeBps },
    [...payRecords],
    input.expectedOutput,
    input.action,
    input.relayerFee,
    input.expectedIsWithFee,
  );

  const maxRecords: bigint[] = [];
  let maxInfo = recordsFee(
    { withdrawFeeBps: input.withdrawFeeBps },
    [...maxRecords],
    maxUint256,
    input.action,
    input.relayerFee,
    input.expectedIsWithFee,
  );

  for (const record of sorted) {
    const isExceedPay = input.expectedIsWithFee ? payInfo.cost >= input.expectedOutput : payInfo.outputAmount >= input.expectedOutput;
    if (payInfo.cost === 0n || !isExceedPay) {
      payRecords.push(record);
      payInfo = recordsFee(
        { withdrawFeeBps: input.withdrawFeeBps },
        [...payRecords],
        input.expectedOutput,
        input.action,
        input.relayerFee,
        input.expectedIsWithFee,
      );
    }

    maxRecords.push(record);
    const tempMax = recordsFee(
      { withdrawFeeBps: input.withdrawFeeBps },
      [...maxRecords],
      maxUint256,
      input.action,
      input.relayerFee,
      input.expectedIsWithFee,
    );
    if (maxInfo.cost === 0n || tempMax.outputAmount > maxInfo.outputAmount) {
      maxInfo = tempMax;
    }
  }

  return { payRecords, payInfo, maxRecords, maxInfo };
};

export class Planner implements PlannerApi {
  constructor(
    private readonly assets: AssetsApi,
    private readonly wallet: WalletService,
    private readonly bridge: ProofBridge,
  ) {}

  private selectMergeInputs(utxos: UtxoRecord[], count = INPUT_NUMBER) {
    const sorted = [...utxos].sort((a, b) => Number(a.amount - b.amount));
    return sorted.slice(0, count);
  }

  private async buildTransferPlan(input: {
    chainId: number;
    assetId: string;
    token: TokenMetadata;
    requestedAmount: bigint;
    to: `0x${string}`;
    relayer: `0x${string}`;
    relayerUrl?: string;
    relayerFee: bigint;
    payIncludesFee?: boolean;
    selectedInputs: UtxoRecord[];
    ownerPk: { user_address: [bigint, bigint] };
    feeSummary: PlannerFeeSummary;
    maxSummary: PlannerFeeSummary;
    okWithMerge: boolean;
  }): Promise<TransferPlan> {
    const required = input.payIncludesFee ? input.requestedAmount : input.requestedAmount + input.relayerFee;
    const sendAmount = input.payIncludesFee ? input.requestedAmount - input.relayerFee : input.requestedAmount;
    if (sendAmount < 0n) {
      throw new SdkError('CONFIG', 'amount is too small to cover relayer fee', { relayerFee: input.relayerFee.toString() });
    }
    const selectedSum = input.selectedInputs.reduce((acc, cur) => acc + cur.amount, 0n);
    if (selectedSum < required) {
      throw new SdkError('CONFIG', 'insufficient shielded balance', { required: required.toString(), selectedSum: selectedSum.toString() });
    }

    const recipientPk = KeyManager.addressToUserPk(input.to);
    const output0 = CryptoToolkit.createRecordOpening({
      asset_id: BigInt(input.token.id),
      asset_amount: sendAmount,
      user_pk: { user_address: recipientPk.user_address },
    });
    const change = selectedSum - required;
    const output1 =
      change > 0n
        ? CryptoToolkit.createRecordOpening({
            asset_id: BigInt(input.token.id),
            asset_amount: change,
            user_pk: { user_address: input.ownerPk.user_address },
          })
        : await this.bridge.createDummyRecordOpening();
    const output2 = await this.bridge.createDummyRecordOpening();

    const outputs = [output0, output1, output2] as const;
    const extraData = [MemoKit.createMemo(output0), MemoKit.createMemo(output1), MemoKit.createMemo(output2)] as const;
    const proofBinding = calcTransferProofBinding({ relayer: input.relayer, extraData });

    return {
      action: 'transfer' as const,
      chainId: input.chainId,
      assetId: input.assetId,
      token: input.token,
      requestedAmount: input.requestedAmount,
      sendAmount,
      to: input.to,
      relayer: input.relayer,
      relayerUrl: input.relayerUrl ?? undefined,
      relayerFee: input.relayerFee,
      required,
      okWithMerge: input.okWithMerge,
      feeSummary: input.feeSummary,
      maxSummary: input.maxSummary,
      selectedInputs: input.selectedInputs,
      selectedSum,
      outputs,
      extraData,
      proofBinding: proofBinding.toString(),
    };
  }

  async estimate(input: { chainId: number; assetId: string; action: 'transfer' | 'withdraw'; amount: bigint; payIncludesFee?: boolean }) {
    const token = this.assets.getPoolInfo(input.chainId, input.assetId);
    if (!token) {
      throw new SdkError('CONFIG', `Token ${input.assetId} not found in chain ${input.chainId}`);
    }

    const relayerConfig = await this.getRelayerConfig(input.chainId);
    const relayerFee = this.getRelayerFee(relayerConfig, token, input.action);

    if (input.action === 'transfer') {
      const required = input.payIncludesFee ? input.amount : input.amount + relayerFee;
      const sendAmount = input.payIncludesFee ? input.amount - relayerFee : input.amount;
      if (sendAmount < 0n) {
        throw new SdkError('CONFIG', 'amount is too small to cover relayer fee', { relayerFee: relayerFee.toString() });
      }
      const utxos = (await this.wallet.getUtxos({ chainId: input.chainId, assetId: input.assetId, includeSpent: false, includeFrozen: false })).rows;
      const { selected, sum } = selectTransferInputs(utxos, required, 3);
      const records = utxos.map((u) => u.amount).filter((v) => v > 0n);
      const estimates = estimateRecords({
        records,
        expectedOutput: input.amount,
        action: 'transfer',
        relayerFee: { transfer: relayerFee, withdraw: 0n },
        withdrawFeeBps: token.withdrawFeeBps,
        expectedIsWithFee: input.payIncludesFee,
      });
      const feeSummary = buildFeeSummary(estimates.payInfo, estimates.payRecords.length);
      const maxSummary = buildFeeSummary(estimates.maxInfo, estimates.maxRecords.length);
      const okWithMerge = feeSummary.cost > 0n;
      return {
        action: 'transfer' as const,
        chainId: input.chainId,
        assetId: input.assetId,
        sendAmount,
        relayerFee,
        required,
        selectedInputs: selected,
        selectedSum: sum,
        ok: sum >= required,
        okWithMerge,
        feeSummary,
        maxSummary,
        constraints: { maxInputs: 3 },
      };
    }

    const withdrawBase = input.payIncludesFee ? input.amount : input.amount + relayerFee;
    const protocolFee = (withdrawBase * BigInt(token.withdrawFeeBps ?? 0)) / 10000n;
    const burnAmount = input.payIncludesFee ? input.amount : input.amount + relayerFee + protocolFee;

    const utxos = (await this.wallet.getUtxos({ chainId: input.chainId, assetId: input.assetId, includeSpent: false, includeFrozen: false })).rows;
    const chosen = selectWithdrawInput(utxos, burnAmount);
    const records = utxos.map((u) => u.amount).filter((v) => v > 0n);
    const estimates = estimateRecords({
      records,
      expectedOutput: input.amount,
      action: 'withdraw',
      relayerFee: { transfer: this.getRelayerFee(relayerConfig, token, 'transfer'), withdraw: relayerFee },
      withdrawFeeBps: token.withdrawFeeBps,
      expectedIsWithFee: input.payIncludesFee,
    });
    const feeSummary = buildFeeSummary(estimates.payInfo, estimates.payRecords.length);
    const maxSummary = buildFeeSummary(estimates.maxInfo, estimates.maxRecords.length);
    const okWithMerge = feeSummary.cost > 0n;
    return {
      action: 'withdraw' as const,
      chainId: input.chainId,
      assetId: input.assetId,
      requestedAmount: input.amount,
      relayerFee,
      protocolFee,
      burnAmount,
      selectedInput: chosen,
      ok: Boolean(chosen),
      okWithMerge,
      feeSummary,
      maxSummary,
      constraints: { requiresSingleInput: true as const },
    };
  }

  async estimateMax(input: { chainId: number; assetId: string; action: 'transfer' | 'withdraw'; payIncludesFee?: boolean }): Promise<PlannerMaxEstimateResult> {
    const token = this.assets.getPoolInfo(input.chainId, input.assetId);
    if (!token) {
      throw new SdkError('CONFIG', `Token ${input.assetId} not found in chain ${input.chainId}`);
    }

    const relayerConfig = await this.getRelayerConfig(input.chainId);
    const relayerFee = this.getRelayerFee(relayerConfig, token, input.action);
    const transferFee = input.action === 'withdraw' ? this.getRelayerFee(relayerConfig, token, 'transfer') : relayerFee;

    const utxos = (await this.wallet.getUtxos({ chainId: input.chainId, assetId: input.assetId, includeSpent: false, includeFrozen: false })).rows;
    const records = utxos.map((u) => u.amount).filter((v) => v > 0n);
    const estimates = estimateRecords({
      records,
      expectedOutput: maxUint256,
      action: input.action,
      relayerFee: { transfer: transferFee, withdraw: relayerFee },
      withdrawFeeBps: token.withdrawFeeBps,
      expectedIsWithFee: input.payIncludesFee,
    });
    const maxSummary = buildFeeSummary(estimates.maxInfo, estimates.maxRecords.length);
    const ok = maxSummary.cost > 0n;

    return {
      action: input.action,
      chainId: input.chainId,
      assetId: input.assetId,
      ok,
      maxSummary,
    };
  }

  async plan(input: Record<string, unknown>) {
    const parsed = parsePlanInput(input);
    const token = this.assets.getPoolInfo(parsed.chainId, parsed.assetId);
    if (!token) {
      throw new SdkError('CONFIG', `Token ${parsed.assetId} not found in chain ${parsed.chainId}`);
    }

    const relayerConfig = await this.getRelayerConfig(parsed.chainId, parsed.relayerUrl);
    const relayerFee = this.getRelayerFee(relayerConfig, token, parsed.action);
    const relayer = relayerConfig.config.relayer_address;
    const relayerUrl = parsed.relayerUrl ?? this.assets.getChain(parsed.chainId).relayerUrl;

    const ownerViewingAddress = this.wallet.getViewingAddress();
    const ownerPk = KeyManager.addressToUserPk(ownerViewingAddress);

    if (parsed.action === 'transfer') {
      const required = parsed.payIncludesFee ? parsed.amount : parsed.amount + relayerFee;
      const sendAmount = parsed.payIncludesFee ? parsed.amount - relayerFee : parsed.amount;
      if (sendAmount < 0n) {
        throw new SdkError('CONFIG', 'amount is too small to cover relayer fee', { relayerFee: relayerFee.toString() });
      }

      const utxos = (await this.wallet.getUtxos({
        chainId: parsed.chainId,
        assetId: parsed.assetId,
        includeSpent: false,
        includeFrozen: false,
      })).rows;
      const { selected, sum } = selectTransferInputs(utxos, required, 3);
      const estimates = estimateRecords({
        records: utxos.map((u) => u.amount).filter((v) => v > 0n),
        expectedOutput: parsed.amount,
        action: 'transfer',
        relayerFee: { transfer: relayerFee, withdraw: 0n },
        withdrawFeeBps: token.withdrawFeeBps,
        expectedIsWithFee: parsed.payIncludesFee,
      });
      const feeSummary = buildFeeSummary(estimates.payInfo, estimates.payRecords.length);
      const maxSummary = buildFeeSummary(estimates.maxInfo, estimates.maxRecords.length);
      const okWithMerge = feeSummary.cost > 0n;

      if (sum < required) {
        const total = utxos.reduce((acc, cur) => acc + cur.amount, 0n);
        if (!okWithMerge || total < required) {
          throw new SdkError('CONFIG', 'insufficient shielded balance', { required: required.toString(), selectedSum: sum.toString() });
        }
        if (!parsed.autoMerge) {
          throw new SdkError('CONFIG', 'insufficient shielded balance', { required: required.toString(), selectedSum: sum.toString() });
        }

        let mergeInputs = this.selectMergeInputs(utxos, INPUT_NUMBER);
        if (mergeInputs.length < INPUT_NUMBER) {
          throw new SdkError('CONFIG', 'insufficient shielded balance for auto-merge', { required: required.toString(), selectedSum: sum.toString() });
        }
        let mergeSum = mergeInputs.reduce((acc, cur) => acc + cur.amount, 0n);
        if (mergeSum <= relayerFee) {
          const largest = [...utxos].sort((a, b) => Number(b.amount - a.amount)).slice(0, INPUT_NUMBER);
          const largestSum = largest.reduce((acc, cur) => acc + cur.amount, 0n);
          if (largestSum <= relayerFee) {
            throw new SdkError('CONFIG', 'insufficient shielded balance for merge fee', {
              relayerFee: relayerFee.toString(),
              mergeSum: mergeSum.toString(),
            });
          }
          mergeInputs = largest;
          mergeSum = largestSum;
        }
        const mergeAmount = mergeSum - relayerFee;
        const mergeEstimates = estimateRecords({
          records: mergeInputs.map((u) => u.amount).filter((v) => v > 0n),
          expectedOutput: mergeAmount,
          action: 'transfer',
          relayerFee: { transfer: relayerFee, withdraw: 0n },
          withdrawFeeBps: token.withdrawFeeBps,
          expectedIsWithFee: false,
        });
        const mergeFeeSummary = buildFeeSummary(mergeEstimates.payInfo, mergeEstimates.payRecords.length);
        const mergeMaxSummary = buildFeeSummary(mergeEstimates.maxInfo, mergeEstimates.maxRecords.length);
        const mergeOkWithMerge = mergeFeeSummary.cost > 0n;

        const mergePlan = await this.buildTransferPlan({
          chainId: parsed.chainId,
          assetId: parsed.assetId,
          token,
          requestedAmount: mergeAmount,
          to: ownerViewingAddress,
          relayer,
          relayerUrl: relayerUrl ?? undefined,
          relayerFee,
          payIncludesFee: false,
          selectedInputs: mergeInputs,
          ownerPk,
          feeSummary: mergeFeeSummary,
          maxSummary: mergeMaxSummary,
          okWithMerge: mergeOkWithMerge,
        });

        return {
          action: 'transfer-merge' as const,
          chainId: parsed.chainId,
          assetId: parsed.assetId,
          requestedAmount: parsed.amount,
          sendAmount,
          to: parsed.to,
          relayer,
          relayerUrl: relayerUrl ?? undefined,
          relayerFee,
          required,
          okWithMerge,
          feeSummary,
          maxSummary,
          mergePlan,
        };
      }

      return this.buildTransferPlan({
        chainId: parsed.chainId,
        assetId: parsed.assetId,
        token,
        requestedAmount: parsed.amount,
        to: parsed.to,
        relayer,
        relayerUrl: relayerUrl ?? undefined,
        relayerFee,
        payIncludesFee: parsed.payIncludesFee,
        selectedInputs: selected,
        ownerPk,
        feeSummary,
        maxSummary,
        okWithMerge,
      });
    }

    const gasDropValue = parsed.gasDropValue ?? 0n;
    const withdrawBase = parsed.payIncludesFee ? parsed.amount : parsed.amount + relayerFee;
    const protocolFee = (withdrawBase * BigInt(token.withdrawFeeBps ?? 0)) / 10000n;
    const burnAmount = parsed.payIncludesFee ? parsed.amount : parsed.amount + relayerFee + protocolFee;

    const utxos = (await this.wallet.getUtxos({
      chainId: parsed.chainId,
      assetId: parsed.assetId,
      includeSpent: false,
      includeFrozen: false,
    })).rows;
    const chosen = selectWithdrawInput(utxos, burnAmount);
    if (!chosen) {
      throw new SdkError('CONFIG', 'no single utxo can cover burn amount', { burnAmount: burnAmount.toString() });
    }
    const estimates = estimateRecords({
      records: utxos.map((u) => u.amount).filter((v) => v > 0n),
      expectedOutput: parsed.amount,
      action: 'withdraw',
      relayerFee: { transfer: this.getRelayerFee(relayerConfig, token, 'transfer'), withdraw: relayerFee },
      withdrawFeeBps: token.withdrawFeeBps,
      expectedIsWithFee: parsed.payIncludesFee,
    });
    const feeSummary = buildFeeSummary(estimates.payInfo, estimates.payRecords.length);
    const maxSummary = buildFeeSummary(estimates.maxInfo, estimates.maxRecords.length);
    const okWithMerge = feeSummary.cost > 0n;

    const change = chosen.amount - burnAmount;
    const outputRo =
      change > 0n
        ? CryptoToolkit.createRecordOpening({
            asset_id: BigInt(token.id),
            asset_amount: change,
            user_pk: { user_address: ownerPk.user_address },
          })
        : await this.bridge.createDummyRecordOpening();

    const extraData = MemoKit.createMemo(outputRo);
    const proofBinding = calcWithdrawProofBinding({
      recipient: parsed.recipient,
      amount: parsed.amount,
      relayer,
      relayerFee,
      gasDropValue,
      extraData,
    });

    return {
      action: 'withdraw' as const,
      chainId: parsed.chainId,
      assetId: parsed.assetId,
      token,
      requestedAmount: parsed.amount,
      relayer,
      relayerUrl: relayerUrl ?? undefined,
      relayerFee,
      protocolFee,
      burnAmount,
      gasDropValue,
      okWithMerge,
      feeSummary,
      maxSummary,
      selectedInput: chosen,
      outputRecordOpening: outputRo,
      extraData,
      proofBinding: proofBinding.toString(),
      recipient: parsed.recipient,
    };
  }

  private async getRelayerConfig(chainId: number, relayerUrlOverride?: string): Promise<RelayerConfig> {
    if (relayerUrlOverride) {
      const config = await fetchRelayerConfigFromRelayerUrl(relayerUrlOverride);
      if (config.config.chain_id !== chainId) {
        throw new SdkError('CONFIG', 'Relayer config chain_id mismatch', { chainId, relayerUrl: relayerUrlOverride, configChainId: config.config.chain_id });
      }
      return config;
    }
    const cached = this.assets.getRelayerConfig(chainId);
    if (cached) return cached;
    return this.assets.syncRelayerConfig(chainId);
  }

  private getRelayerFee(config: RelayerConfig, token: TokenMetadata, action: 'transfer' | 'withdraw'): bigint {
    const key = tokenFeeKey(token);
    const table = action === 'transfer' ? config.fee_configure.transfer : config.fee_configure.withdraw;
    const fee = (table as any)?.[key]?.fee;
    return fee != null ? BigInt(fee) : 0n;
  }
}
