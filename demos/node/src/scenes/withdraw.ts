import type { DemoContext } from './_types.js';
type Hex = `0x${string}`;
import { getAddress, isAddress } from 'viem';
import { getChain, getToken } from '../domain/ocash.js';
import { parseAmount } from '../domain/format.js';
import { getClients } from '../io/clients.js';
import { c } from '../cli/color.js';

export async function demoWithdraw(ctx: DemoContext) {
  const chain = getChain(ctx.config.chains, ctx.flags.chainId ? Number(ctx.flags.chainId) : undefined);
  const token = getToken(chain, ctx.flags.token ? String(ctx.flags.token) : undefined);
  if (!chain.ocashContractAddress) throw new Error(`chain ${chain.chainId} missing ocashContractAddress`);
  if (!chain.relayerUrl) throw new Error(`chain ${chain.chainId} missing relayerUrl`);
  if (!chain.merkleProofUrl) throw new Error(`chain ${chain.chainId} missing merkleProofUrl`);

  const amountIn = ctx.flags.amount ? String(ctx.flags.amount) : undefined;
  if (!amountIn) throw new Error('missing --amount');
  const recipient = ctx.flags.recipient ? String(ctx.flags.recipient) : undefined;
  if (!recipient) throw new Error('missing --recipient (EVM address)');
  if (!isAddress(recipient)) throw new Error('invalid --recipient');
  const recipientAddress = getAddress(recipient);

  await ctx.sdk.core.ready();
  await ctx.sdk.wallet.open({ seed: ctx.config.seed, accountNonce: ctx.config.accountNonce });
  await ctx.sdk.sync.syncOnce({ chainIds: [chain.chainId] });

  const amount = parseAmount(amountIn, token.decimals);

  const { publicClient } = getClients(chain);

  const owner = ctx.sdk.keys.deriveKeyPair(ctx.config.seed, ctx.config.accountNonce != null ? String(ctx.config.accountNonce) : undefined);

  const prepared = await ctx.sdk.ops.prepareWithdraw({
    chainId: chain.chainId,
    assetId: token.id,
    amount,
    recipient: recipientAddress,
    ownerKeyPair: owner,
    publicClient,
  });

  const submit = await ctx.sdk.ops.submitRelayerRequest<Hex>({ prepared, publicClient });
  console.log(c.green('relayer tx:'), submit.result);

  const txhash = await submit.waitRelayerTxHash;
  console.log(c.green('chain tx:'), txhash);

  const receipt = await submit.transactionReceipt;
}
