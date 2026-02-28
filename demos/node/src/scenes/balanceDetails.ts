import type { DemoContext } from './_types.js';
import { getChain } from '../domain/ocash.js';
import { formatAmount } from '../domain/format.js';

export async function demoBalanceDetails(ctx: DemoContext) {
  const chain = getChain(ctx.config.chains, ctx.flags.chainId ? Number(ctx.flags.chainId) : undefined);
  await ctx.sdk.core.ready();
  await ctx.sdk.wallet.open({ seed: ctx.config.seed, accountNonce: ctx.config.accountNonce });
  await ctx.sdk.sync.syncOnce({ chainIds: [chain.chainId] });

  const utxos = (await ctx.sdk.wallet.getUtxos({ chainId: chain.chainId, includeSpent: true, includeFrozen: true })).rows;
  const tokens = new Map(ctx.sdk.assets.getTokens(chain.chainId).map((t) => [t.id, t]));

  for (const utxo of utxos.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))) {
    const token = tokens.get(utxo.assetId);
    const symbol = token?.symbol ?? utxo.assetId;
    const decimals = token?.decimals ?? 18;
    console.log({
      symbol,
      amount: formatAmount(utxo.amount, decimals),
      mkIndex: utxo.mkIndex,
      isSpent: utxo.isSpent,
      isFrozen: utxo.isFrozen,
      commitment: utxo.commitment,
      nullifier: utxo.nullifier,
      createdAt: utxo.createdAt,
    });
  }
}
