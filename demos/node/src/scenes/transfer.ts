import type { DemoContext } from './_types.js';
type Hex = `0x${string}`;
import { getChain, getToken } from '../domain/ocash.js';
import { parseAmount } from '../domain/format.js';
import { getClients } from '../io/clients.js';
import { c } from '../cli/color.js';

const isViewingAddress = (value: string): value is Hex => /^0x[0-9a-fA-F]{64}$/.test(value);

export async function demoTransfer(ctx: DemoContext) {
  const chain = getChain(ctx.config.chains, ctx.flags.chainId ? Number(ctx.flags.chainId) : undefined);
  const token = getToken(chain, ctx.flags.token ? String(ctx.flags.token) : undefined);
  if (!chain.ocashContractAddress) throw new Error(`chain ${chain.chainId} missing ocashContractAddress`);
  if (!chain.relayerUrl) throw new Error(`chain ${chain.chainId} missing relayerUrl`);
  if (!chain.rpcUrl) throw new Error(`chain ${chain.chainId} missing rpcUrl`);
  if (!chain.merkleProofUrl) throw new Error(`chain ${chain.chainId} missing merkleProofUrl`);

  const amountIn = ctx.flags.amount ? String(ctx.flags.amount) : undefined;
  if (!amountIn) throw new Error('missing --amount');

  const to = ctx.flags.to ? String(ctx.flags.to) : undefined;
  if (!to) throw new Error('missing --to (OCash viewing address)');
  if (!isViewingAddress(to)) throw new Error('invalid --to (expected 0x + 64 hex chars viewing address)');

  await ctx.sdk.core.ready();
  await ctx.sdk.wallet.open({ seed: ctx.config.seed, accountNonce: ctx.config.accountNonce });
  await ctx.sdk.sync.syncOnce({ chainIds: [chain.chainId] });

  const amount = parseAmount(amountIn, token.decimals);

  const { publicClient } = getClients(chain);
  const owner = ctx.sdk.keys.deriveKeyPair(ctx.config.seed, ctx.config.accountNonce != null ? String(ctx.config.accountNonce) : undefined);

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
  if (!receipt) throw new Error('transaction receipt unavailable');
}
