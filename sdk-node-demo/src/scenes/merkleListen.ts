import type { DemoContext } from './_types.js';
import { App_ABI } from '@ocash/sdk';
import { getChain } from '../runtime/utils/ocash.js';
import { getClients } from '../runtime/utils/clients.js';

export async function demoMerkleListen(ctx: DemoContext) {
  const chain = getChain(ctx.config.chains, ctx.flags.chainId ? Number(ctx.flags.chainId) : undefined);
  if (!chain.ocashContractAddress) throw new Error(`chain ${chain.chainId} missing ocashContractAddress`);
  const { publicClient } = getClients(chain);
  console.log('watching ArrayMergedToTree on', chain.ocashContractAddress);

  const unwatch = publicClient.watchContractEvent({
    address: chain.ocashContractAddress,
    abi: App_ABI as any,
    eventName: 'ArrayMergedToTree',
    onLogs: (logs: any[]) => {
      for (const log of logs) {
        console.log('[ArrayMergedToTree]', { batchIndex: (log.args as any).batchIndex?.toString?.(), newRoot: (log.args as any).newRoot?.toString?.(), txHash: log.transactionHash });
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
