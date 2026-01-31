import type { DemoContext } from './_types.js';
import { getChain, getToken } from '../runtime/utils/ocash.js';
import { parseAmount } from '../runtime/utils/format.js';
import { getClients } from '../runtime/utils/clients.js';
import { c } from '../runtime/utils/color.js';

export async function demoDeposit(ctx: DemoContext) {
  const chain = getChain(ctx.config.chains, ctx.flags.chainId ? Number(ctx.flags.chainId) : undefined);
  const token = getToken(chain, ctx.flags.token ? String(ctx.flags.token) : undefined);
  if (!chain.ocashContractAddress) throw new Error(`chain ${chain.chainId} missing ocashContractAddress`);

  const amountIn = ctx.flags.amount ? String(ctx.flags.amount) : undefined;
  if (!amountIn) throw new Error('missing --amount');
  const amount = parseAmount(amountIn, token.decimals);

  const privateKey = (ctx.flags.privateKey ? String(ctx.flags.privateKey) : undefined) as `0x${string}` | undefined;
  const signerPrivateKey = privateKey ?? ctx.config.signerPrivateKey ?? (process.env.OCASH_DEMO_PRIVATE_KEY as `0x${string}` | undefined);
  if (!signerPrivateKey) throw new Error('missing signer private key (set ocash.config.json signerPrivateKey or --privateKey)');

  const { publicClient, walletClient, account } = getClients(chain, signerPrivateKey);
  if (!walletClient || !account) throw new Error('wallet client not available');

  const pub = ctx.sdk.keys.getPublicKeyBySeed(ctx.config.seed, ctx.config.accountNonce != null ? String(ctx.config.accountNonce) : undefined);
  const prepared = await ctx.sdk.ops.prepareDeposit({
    chainId: chain.chainId,
    assetId: token.id,
    amount,
    ownerPublicKey: pub,
    account: account.address,
    publicClient,
  });

  if (prepared.approveNeeded && prepared.approveRequest) {
    console.log(
      c.cyan('approving'),
      prepared.approveRequest.address,
      c.gray('to'),
      prepared.approveRequest.args[0],
      c.gray('amount'),
      c.yellow(prepared.approveRequest.args[1].toString()),
    );
    const approveHash = await walletClient.writeContract(prepared.approveRequest as any);
    await publicClient.waitForTransactionReceipt({ hash: approveHash });
    console.log(c.green('approved:'), approveHash);
  }

  const outputCommitments = [ctx.sdk.crypto.commitment(prepared.recordOpening, 'hex')];
  const op = ctx.store.createOperation({
    type: 'deposit',
    chainId: chain.chainId,
    tokenId: token.id,
    detail: {
      token: token.symbol,
      amount: amount.toString(),
      protocolFee: prepared.protocolFee.toString(),
      depositRelayerFee: prepared.depositRelayerFee.toString(),
      outputCommitments,
    },
  });

  console.log(
    c.cyan('depositing'),
    c.gray('poolId='),
    token.id,
    c.gray('amount='),
    c.yellow(amount.toString()),
    c.gray('value='),
    c.yellow(prepared.value.toString()),
  );
  const hash = await walletClient.writeContract(prepared.depositRequest as any);
  ctx.store.updateOperation(op.id, { status: 'submitted', txHash: hash });
  console.log(c.green('tx:'), hash);

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  ctx.store.updateOperation(op.id, { status: receipt.status === 'success' ? 'confirmed' : 'failed' });
  console.log(c.bold('receipt:'), { status: receipt.status, blockNumber: receipt.blockNumber });
}
