import type { Address, PublicClient } from 'viem';
import { SdkError } from '../errors';
import type { TokenMetadata } from '../types';
import { App_ABI } from '../abi/app';
import { ERC20_ABI } from '../abi/erc20';
import { normalizeTokenMetadata } from './tokenNormalize';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as const;

type PoolInfo = {
  token: Address;
  depositFeeBPS: number | bigint;
  withdrawFeeBPS: number | bigint;
  viewerPK: readonly [bigint, bigint] | readonly [string, string] | readonly unknown[];
  freezerPK: readonly [bigint, bigint] | readonly [string, string] | readonly unknown[];
  transferMaxAmount: bigint;
  withdrawMaxAmount: bigint;
};

const toPoolInfo = (value: unknown): PoolInfo => {
  if (!value || typeof value !== 'object') throw new Error('invalid pool info');
  const v: any = value;
  if (typeof v.token === 'string') return v as PoolInfo;
  if (Array.isArray(v)) {
    return {
      token: v[0],
      depositFeeBPS: v[1],
      withdrawFeeBPS: v[2],
      viewerPK: v[4],
      freezerPK: v[5],
      transferMaxAmount: v[6],
      withdrawMaxAmount: v[7],
    } as PoolInfo;
  }
  return v as PoolInfo;
};

export async function fetchPoolTokensFromContract(input: {
  publicClient: PublicClient;
  chainId: number;
  contractAddress: Address;
  maxPools?: number;
  includeErc20Metadata?: boolean;
}) {
  const maxPools = input.maxPools == null ? 16 : Math.max(1, Math.floor(input.maxPools));
  const includeErc20Metadata = Boolean(input.includeErc20Metadata);

  const poolIdsReq = Array.from({ length: maxPools }, (_, idx) => ({
    chainId: input.chainId,
    address: input.contractAddress,
    abi: App_ABI,
    functionName: 'poolIds' as const,
    args: [BigInt(idx)],
  }));

  let poolIdsRes: any[];
  try {
    poolIdsRes = (await (input.publicClient as any).multicall({ contracts: poolIdsReq, allowFailure: true })) as any[];
  } catch (error) {
    throw new SdkError('CONFIG', 'Failed to fetch poolIds via multicall', { chainId: input.chainId, contract: input.contractAddress }, error);
  }

  const poolIds = poolIdsRes
    .map((r) => (r && r.status === 'success' ? (r.result as bigint) : null))
    .filter((id): id is bigint => typeof id === 'bigint' && id !== 0n);

  if (!poolIds.length) return [];

  const poolInfoReq = poolIds.map((poolId) => ({
    chainId: input.chainId,
    address: input.contractAddress,
    abi: App_ABI,
    functionName: 'getPoolInfo' as const,
    args: [poolId],
  }));

  let poolInfoRes: any[];
  try {
    poolInfoRes = (await (input.publicClient as any).multicall({ contracts: poolInfoReq, allowFailure: true })) as any[];
  } catch (error) {
    throw new SdkError('CONFIG', 'Failed to fetch getPoolInfo via multicall', { chainId: input.chainId, contract: input.contractAddress }, error);
  }

  const tokens: TokenMetadata[] = [];
  const tokenAddrByIndex: Address[] = [];

  for (let i = 0; i < poolInfoRes.length; i++) {
    const row = poolInfoRes[i];
    if (!row || row.status !== 'success') continue;
    const poolId = poolIds[i]!;
    let info: PoolInfo;
    try {
      info = toPoolInfo(row.result);
    } catch (error) {
      throw new SdkError('CONFIG', 'Invalid getPoolInfo payload', { chainId: input.chainId, poolId: poolId.toString() }, error);
    }
    if (!info?.token || String(info.token).toLowerCase() === ZERO_ADDRESS) continue;

    const token: TokenMetadata = normalizeTokenMetadata({
      id: poolId.toString(),
      wrappedErc20: info.token,
      viewerPk: info.viewerPK as any,
      freezerPk: info.freezerPK as any,
      depositFeeBPS: info.depositFeeBPS as any,
      withdrawFeeBPS: info.withdrawFeeBPS as any,
      transferMaxAmount: info.transferMaxAmount,
      withdrawMaxAmount: info.withdrawMaxAmount,
      symbol: '',
      decimals: 0,
    });
    tokens.push(token);
    tokenAddrByIndex.push(info.token);
  }

  if (!includeErc20Metadata || !tokens.length) return tokens;

  const erc20Req = tokenAddrByIndex.flatMap((address) => [
    { chainId: input.chainId, address, abi: ERC20_ABI, functionName: 'symbol' as const, args: [] as const },
    { chainId: input.chainId, address, abi: ERC20_ABI, functionName: 'decimals' as const, args: [] as const },
  ]);

  let erc20Res: any[];
  try {
    erc20Res = (await (input.publicClient as any).multicall({ contracts: erc20Req, allowFailure: true })) as any[];
  } catch (error) {
    // Metadata is best-effort. Return bare tokens.
    return tokens;
  }

  for (let i = 0; i < tokens.length; i++) {
    const symbolRow = erc20Res[i * 2];
    const decimalsRow = erc20Res[i * 2 + 1];
    if (symbolRow?.status === 'success' && typeof symbolRow.result === 'string') {
      tokens[i] = { ...tokens[i]!, symbol: symbolRow.result };
    }
    if (decimalsRow?.status === 'success') {
      const dec = decimalsRow.result;
      const decimals = typeof dec === 'number' && Number.isFinite(dec) ? dec : typeof dec === 'bigint' ? Number(dec) : undefined;
      if (decimals != null) tokens[i] = { ...tokens[i]!, decimals };
    }
  }

  return tokens;
}

