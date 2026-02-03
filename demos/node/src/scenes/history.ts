import type { DemoContext } from './_types.js';
import type { ListOperationsQuery, OperationStatus } from '@ocash/sdk';

export async function demoHistory(ctx: DemoContext) {
  await ctx.sdk.core.ready();
  await ctx.sdk.wallet.open({ seed: ctx.config.seed, accountNonce: ctx.config.accountNonce });

  const toStr = (v: unknown) => (typeof v === 'string' && v.length ? v : undefined);
  const toNum = (v: unknown) => {
    const s = toStr(v);
    return s != null ? Number(s) : undefined;
  };

  const status = toStr(ctx.flags.status);
  const isStatus = (v: string): v is OperationStatus => v === 'created' || v === 'submitted' || v === 'confirmed' || v === 'failed';

  const query: ListOperationsQuery = {
    limit: toNum(ctx.flags.limit) ?? 50,
    offset: toNum(ctx.flags.offset) ?? 0,
    chainId: toNum(ctx.flags.chainId),
    tokenId: toStr(ctx.flags.tokenId),
    type: toStr(ctx.flags.type),
    status: status && isStatus(status) ? status : undefined,
    sort: toStr(ctx.flags.sort) === 'asc' ? 'asc' : undefined,
  };

  console.log(ctx.store.listOperations(query));
}
