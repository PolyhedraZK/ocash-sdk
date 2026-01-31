import type { DemoContext } from './_types.js';
import { getChain } from '../runtime/utils/ocash.js';
import { c } from '../runtime/utils/color.js';

export async function demoSync(ctx: DemoContext) {
  const chain = getChain(ctx.config.chains, ctx.flags.chainId ? Number(ctx.flags.chainId) : undefined);
  await ctx.sdk.core.ready();
  await ctx.sdk.wallet.open({ seed: ctx.config.seed, accountNonce: ctx.config.accountNonce });

  const toNum = (v: unknown) => {
    if (typeof v !== 'string' || !v.length) return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  };
  const pageSize = toNum(ctx.flags.pageSize);
  const requestTimeoutMs = toNum(ctx.flags.requestTimeoutMs);
  const pollMs = toNum(ctx.flags.pollMs);
  const watch = Boolean(ctx.flags.watch);

  ctx.sdk.core.on('sync:progress', (evt: any) => {
    console.log(
      c.magenta('[sync]'),
      c.gray(String(evt.payload.chainId)),
      c.gray(String(evt.payload.resource)),
      c.gray(String(evt.payload.downloaded)),
      c.gray('/'),
      c.gray(String(evt.payload.total ?? '?')),
    );
  });

  if (!watch) {
    await ctx.sdk.sync.syncOnce({ chainIds: [chain.chainId], pageSize, requestTimeoutMs });
    console.log(c.bold('syncStatus:'), ctx.sdk.sync.getStatus());
    return;
  }

  await ctx.sdk.sync.start({ chainIds: [chain.chainId], pollMs });
  console.log(c.green('sync started:'), { chainId: chain.chainId, pollMs: pollMs ?? null });

  const stopAfterMs = toNum(ctx.flags.ms);
  if (stopAfterMs && stopAfterMs > 0) {
    await new Promise<void>((resolve) => setTimeout(resolve, stopAfterMs));
    ctx.sdk.sync.stop();
    console.log(c.yellow('sync stopped'));
    return;
  }

  process.on('SIGINT', () => {
    ctx.sdk.sync.stop();
    process.exit(0);
  });
  await new Promise<void>(() => {});
}
