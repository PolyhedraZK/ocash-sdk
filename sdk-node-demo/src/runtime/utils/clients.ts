import type { ChainConfigInput } from '@ocash/sdk';
import { createPublicClient, createWalletClient, defineChain, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

export function getClients(chain: ChainConfigInput, privateKey?: `0x${string}`) {
  if (!chain.rpcUrl) throw new Error(`chain ${chain.chainId} missing rpcUrl`);
  const chainDef = defineChain({
    id: chain.chainId,
    name: `chain-${chain.chainId}`,
    nativeCurrency: { name: 'Native', symbol: 'NATIVE', decimals: 18 },
    rpcUrls: { default: { http: [chain.rpcUrl] } },
  });
  const publicClient = createPublicClient({ chain: chainDef, transport: http(chain.rpcUrl) });

  const account = privateKey ? privateKeyToAccount(privateKey) : undefined;
  const walletClient = account ? createWalletClient({ chain: chainDef, account, transport: http(chain.rpcUrl) }) : undefined;
  return { publicClient, walletClient, account };
}
