import type { DemoContext } from './_types.js';
import { App_ABI } from '@ocash/sdk';
import { getChain } from '../domain/ocash.js';
import { getClients } from '../io/clients.js';

export async function demoMerkleListen(ctx: DemoContext) {
  const chain = getChain(ctx.config.chains, ctx.flags.chainId ? Number(ctx.flags.chainId) : undefined);
  if (!chain.ocashContractAddress) throw new Error(`chain ${chain.chainId} missing ocashContractAddress`);
  const { publicClient } = getClients(chain);
  console.log('watching ArrayMergedToTree on', chain.ocashContractAddress);

  const unwatch = publicClient.watchContractEvent({
    address: chain.ocashContractAddress,
    abi: App_ABI,
    eventName: 'ArrayMergedToTree',
    onLogs: (logs) => {
      for (const log of logs) {
        console.log('[ArrayMergedToTree]', { batchIndex: log.args.batchIndex?.toString?.(), newRoot: log.args.newRoot?.toString?.(), txHash: log.transactionHash });
      }
    },
  });

  const stopAfter = ctx.flags.ms ? Number(ctx.flags.ms) : undefined;
  if (stopAfter) {
    setTimeout(() => {
      unwatch();
      console.log('stopped');
    }, stopAfter);
  }
}
