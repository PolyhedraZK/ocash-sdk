import type { DemoContext } from './_types.js';
import { getChain, getToken, tokenHexId } from '../domain/ocash.js';

export async function demoAssets(ctx: DemoContext) {
  const chain = getChain(ctx.config.chains, ctx.flags.chainId ? Number(ctx.flags.chainId) : undefined);
  console.log('chain:', { chainId: chain.chainId, rpcUrl: chain.rpcUrl, entryUrl: chain.entryUrl, relayerUrl: chain.relayerUrl, ocashContractAddress: chain.ocashContractAddress });

  const tokens = ctx.sdk.assets.getTokens(chain.chainId);
  console.log('tokens:', tokens.map((t) => ({ id: t.id, hexId: tokenHexId(t), symbol: t.symbol, decimals: t.decimals, wrappedErc20: t.wrappedErc20 })));

  if (ctx.flags.relayerConfig) {
    const cfg = await ctx.sdk.assets.syncRelayerConfig(chain.chainId);
    console.log('relayerConfig:', cfg);
  }

  if (ctx.flags.token) {
    const token = getToken(chain, String(ctx.flags.token));
    console.log('token:', token);
    console.log('poolInfo:', ctx.sdk.assets.getPoolInfo(chain.chainId, token.id));
  }
}

