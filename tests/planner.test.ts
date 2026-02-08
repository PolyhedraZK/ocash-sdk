import { describe, expect, it } from 'vitest';
import { Planner } from '../src/planner/planner';
import { MemoryStore } from '../src/store/memoryStore';
import { WalletService } from '../src/wallet/walletService';
import { CryptoToolkit } from '../src/crypto/cryptoToolkit';
import { KeyManager } from '../src/crypto/keyManager';

const makeAssets = (input: {
  chainId: number;
  token: {
    id: string;
    symbol: string;
    decimals: number;
    wrappedErc20: `0x${string}`;
    viewerPk: [string, string];
    freezerPk: [string, string];
    withdrawFeeBps?: number;
  };
  relayerFee?: bigint;
}) => {
  const chains = [
    {
      chainId: input.chainId,
      tokens: [input.token],
    },
  ];
  const relayerConfig = {
    config: {
      contract_address: input.token.wrappedErc20,
      chain_id: input.chainId,
      name: 'test',
      relayer_address: '0x0000000000000000000000000000000000000001' as const,
    },
    fee_configure: {
      valid_time: 0,
      transfer: {
        [`0x${BigInt(input.token.id).toString(16)}`]: { token_address: input.token.wrappedErc20, fee: input.relayerFee ?? 0n },
      },
      withdraw: {
        [`0x${BigInt(input.token.id).toString(16)}`]: { token_address: input.token.wrappedErc20, fee: input.relayerFee ?? 0n },
      },
    },
  };

  return {
    getChains: () => chains as any,
    getChain: (chainId: number) => {
      const found = chains.find((c) => c.chainId === chainId);
      if (!found) throw new Error('chain not found');
      return found as any;
    },
    getTokens: (chainId: number) => (chains.find((c) => c.chainId === chainId)?.tokens ?? []) as any,
    getPoolInfo: (chainId: number, tokenId: string) => (chains.find((c) => c.chainId === chainId)?.tokens ?? []).find((t) => t.id === tokenId) as any,
    getAllowanceTarget: () => input.token.wrappedErc20 as any,
    appendTokens: () => undefined,
    loadFromUrl: async () => undefined,
    getRelayerConfig: () => relayerConfig as any,
    syncRelayerConfig: async () => relayerConfig as any,
    syncAllRelayerConfigs: async () => undefined,
  };
};

describe('Planner.plan', () => {
  it('rejects transfer when to is not a hex string', async () => {
    const planner = new Planner({} as any, {} as any, {} as any);
    await expect(planner.plan({ action: 'transfer', chainId: 1, assetId: '1', amount: 1n, to: 'nope' } as any)).rejects.toThrow(/to/i);
  });

  it('rejects withdraw when recipient is not a hex string', async () => {
    const planner = new Planner({} as any, {} as any, {} as any);
    await expect(planner.plan({ action: 'withdraw', chainId: 1, assetId: '1', amount: 1n, recipient: 'nope' } as any)).rejects.toThrow(/recipient/i);
  });

  it('plans a transfer with 3 outputs and extraData', async () => {
    const chainId = 1;
    const token = {
      id: '1',
      symbol: 'T',
      decimals: 18,
      wrappedErc20: '0x0000000000000000000000000000000000000002' as const,
      viewerPk: ['1', '2'] as [string, string],
      freezerPk: ['3', '4'] as [string, string],
    };
    const assets = makeAssets({ chainId, token, relayerFee: 0n });
    const store = new MemoryStore();
    const wallet = new WalletService(assets as any, store as any, () => undefined);
    await wallet.open({ seed: 'planner-test-seed-key' });

    const validUserAddress = KeyManager.getPublicKeyBySeed('planner-test-seed-key', '0').user_pk.user_address;
    const bridge = {
      createDummyRecordOpening: async () =>
        CryptoToolkit.createRecordOpening({
          asset_id: 1n,
          asset_amount: 0n,
          user_pk: { user_address: [validUserAddress[0], validUserAddress[1]] },
        }),
    } as any;

    await store.upsertUtxos([
      {
        chainId,
        assetId: token.id,
        amount: 100n,
        commitment: '0x01' as any,
        nullifier: '0x02' as any,
        mkIndex: 1,
        isFrozen: false,
        isSpent: false,
        memo: '0x03' as any,
      },
    ]);

    const planner = new Planner(assets as any, wallet as any, bridge);
    const receiver = KeyManager.userPkToAddress(KeyManager.getPublicKeyBySeed('planner-test-seed-key', '1').user_pk as any);
    const plan = (await planner.plan({ action: 'transfer', chainId, assetId: token.id, amount: 60n, to: receiver })) as any;

    expect(plan.action).toBe('transfer');
    expect(Array.isArray(plan.outputs)).toBe(true);
    expect(plan.outputs).toHaveLength(3);
    expect(Array.isArray(plan.extraData)).toBe(true);
    expect(plan.extraData).toHaveLength(3);
    expect(Array.isArray(plan.selectedInputs)).toBe(true);
    expect(plan.selectedInputs.length).toBeGreaterThan(0);
  });

  it('rejects withdraw when no single utxo can cover burn amount', async () => {
    const chainId = 1;
    const token = {
      id: '1',
      symbol: 'T',
      decimals: 18,
      wrappedErc20: '0x0000000000000000000000000000000000000002' as const,
      viewerPk: ['1', '2'] as [string, string],
      freezerPk: ['3', '4'] as [string, string],
      withdrawFeeBps: 0,
    };
    const assets = makeAssets({ chainId, token, relayerFee: 0n });
    const store = new MemoryStore();
    const wallet = new WalletService(assets as any, store as any, () => undefined);
    await wallet.open({ seed: 'planner-test-seed-key' });

    const validUserAddress = KeyManager.getPublicKeyBySeed('planner-test-seed-key', '0').user_pk.user_address;
    const bridge = {
      createDummyRecordOpening: async () =>
        CryptoToolkit.createRecordOpening({
          asset_id: 1n,
          asset_amount: 0n,
          user_pk: { user_address: [validUserAddress[0], validUserAddress[1]] },
        }),
    } as any;

    await store.upsertUtxos([
      {
        chainId,
        assetId: token.id,
        amount: 10n,
        commitment: '0x01' as any,
        nullifier: '0x02' as any,
        mkIndex: 1,
        isFrozen: false,
        isSpent: false,
        memo: '0x03' as any,
      },
      {
        chainId,
        assetId: token.id,
        amount: 10n,
        commitment: '0x11' as any,
        nullifier: '0x12' as any,
        mkIndex: 2,
        isFrozen: false,
        isSpent: false,
        memo: '0x13' as any,
      },
    ]);

    const planner = new Planner(assets as any, wallet as any, bridge);
    await expect(planner.plan({ action: 'withdraw', chainId, assetId: token.id, amount: 15n, recipient: '0x0000000000000000000000000000000000000003' })).rejects.toThrow(
      /no single utxo/i,
    );
  });
});
