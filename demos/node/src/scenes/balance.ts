import type { DemoContext } from './_types.js';
import { getChain } from '../domain/ocash.js';
import { formatAmount } from '../domain/format.js';
import { c } from '../cli/color.js';

export async function demoBalance(ctx: DemoContext) {
  const chain = getChain(ctx.config.chains, ctx.flags.chainId ? Number(ctx.flags.chainId) : undefined);
  await ctx.sdk.core.ready();
  await ctx.sdk.wallet.open({ seed: ctx.config.seed, accountNonce: ctx.config.accountNonce });
  await ctx.sdk.sync.syncOnce({ chainIds: [chain.chainId] });

  const tokens = ctx.sdk.assets.getTokens(chain.chainId);
  for (const token of tokens) {
    const amount = await ctx.sdk.wallet.getBalance({ chainId: chain.chainId, assetId: token.id });
    console.log(c.bold(`${token.symbol}:`), c.green(formatAmount(amount, token.decimals)));
  }
}
