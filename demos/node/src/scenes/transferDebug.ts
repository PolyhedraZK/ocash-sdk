import type { DemoContext } from './_types.js';
import { getChain, getToken } from '../domain/ocash.js';
import { formatAmount, parseAmount } from '../domain/format.js';
import { getClients } from '../io/clients.js';
import { c } from '../cli/color.js';

type Hex = `0x${string}`;

const isViewingAddress = (value: string): value is Hex => /^0x[0-9a-fA-F]{64}$/.test(value);

export async function demoTransferDebug(ctx: DemoContext) {
  const chain = getChain(ctx.config.chains, ctx.flags.chainId ? Number(ctx.flags.chainId) : undefined);
  const token = getToken(chain, ctx.flags.token ? String(ctx.flags.token) : '1');

  if (!chain.ocashContractAddress) throw new Error(`chain ${chain.chainId} missing ocashContractAddress`);
  if (!chain.relayerUrl) throw new Error(`chain ${chain.chainId} missing relayerUrl`);
  if (!chain.rpcUrl) throw new Error(`chain ${chain.chainId} missing rpcUrl`);
  if (!chain.merkleProofUrl) throw new Error(`chain ${chain.chainId} missing merkleProofUrl`);

  await ctx.sdk.core.ready();
  await ctx.sdk.wallet.open({ seed: ctx.config.seed, accountNonce: ctx.config.accountNonce });
  await ctx.sdk.sync.syncOnce({ chainIds: [chain.chainId] });

  const { publicClient } = getClients(chain);
  const owner = ctx.sdk.keys.deriveKeyPair(ctx.config.seed, ctx.config.accountNonce != null ? String(ctx.config.accountNonce) : undefined);
  const selfViewingAddress = ctx.sdk.keys.userPkToAddress(owner.user_pk) as Hex;

  // Debug: print current shielded assets/utxos before prepareTransfer
  {
    const allTokens = ctx.sdk.assets.getTokens(chain.chainId);
    const tokenById = new Map(allTokens.map((t) => [t.id, t] as const));
    const balances = await Promise.all(
      allTokens.map(async (t) => ({
        symbol: t.symbol,
        assetId: t.id,
        amount: await ctx.sdk.wallet.getBalance({ chainId: chain.chainId, assetId: t.id }),
        decimals: t.decimals,
      })),
    );
    console.log(c.dim('shielded balances:'));
    for (const b of balances) {
      if (b.amount === 0n) continue;
      console.log(`- ${b.symbol}: ${formatAmount(b.amount, b.decimals)} (${b.assetId})`);
    }

    const utxos = await ctx.sdk.wallet.getUtxos({ chainId: chain.chainId, includeSpent: true, includeFrozen: true });
    console.log(c.dim(`utxos(total=${utxos.length}):`));
    for (const u of utxos.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0)).slice(0, 20)) {
      const t = tokenById.get(u.assetId);
      const symbol = t?.symbol ?? u.assetId;
      const decimals = t?.decimals ?? 18;
      console.log({
        symbol,
        amount: formatAmount(u.amount, decimals),
        mkIndex: u.mkIndex,
        isSpent: u.isSpent,
        isFrozen: u.isFrozen,
        commitment: u.commitment,
        nullifier: u.nullifier,
        createdAt: u.createdAt,
      });
    }
  }

  const to = ctx.flags.to ? String(ctx.flags.to) : selfViewingAddress;
  if (!isViewingAddress(to)) throw new Error('invalid --to (expected 0x + 64 hex chars viewing address)');

  const amountIn = ctx.flags.amount ? String(ctx.flags.amount) : undefined;
  let amount: bigint;

  if (amountIn) {
    amount = parseAmount(amountIn, token.decimals);
  } else {
    const maxEstimate = await ctx.sdk.planner.estimateMax({ chainId: chain.chainId, assetId: token.id, action: 'transfer' });
    if (!maxEstimate.ok || maxEstimate.maxSummary.outputAmount <= 0n) {
      throw new Error(`max amount not available for token ${token.symbol}; pass --amount to override`);
    }
    amount = maxEstimate.maxSummary.outputAmount;
  }

  const summary = [c.dim('chainId=') + String(chain.chainId), c.dim('token=') + token.symbol, c.dim('to=') + to, c.dim('amount=') + formatAmount(amount, token.decimals)]
    .filter((v): v is string => typeof v === 'string')
    .join(' ');
  console.log(summary);

  const prepared = await ctx.sdk.ops.prepareTransfer({
    chainId: chain.chainId,
    assetId: token.id,
    amount,
    to,
    ownerKeyPair: owner,
    publicClient,
    autoMerge: true,
  });
  if (prepared.kind === 'merge') {
    throw new Error('merge required: submit prepared.merge.request, wait for confirmation, sync, then retry transfer');
  }

  const submit = await ctx.sdk.ops.submitRelayerRequest<Hex>({ prepared, publicClient });
  console.log(c.green('relayer tx:'), submit.result);

  const txhash = await submit.waitRelayerTxHash;
  console.log(c.green('chain tx:'), txhash);

  const receipt = await submit.TransactionReceipt;
}
