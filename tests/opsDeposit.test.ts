import { describe, expect, it } from 'vitest';
import { Ops } from '../src/ops/ops';
import { TxBuilder } from '../src/tx/txBuilder';
import { KeyManager } from '../src/crypto/keyManager';

describe('Ops.prepareDeposit', () => {
  it('returns approveNeeded for ERC20 when allowance is low', async () => {
    const chainId = 1;
    const assets = {
      getChain: () => ({ chainId, ocashContractAddress: '0x0000000000000000000000000000000000000001', tokens: [] }),
      getPoolInfo: () => ({
        id: '1',
        symbol: 'T',
        decimals: 18,
        wrappedErc20: '0x0000000000000000000000000000000000000002',
        viewerPk: ['1', '2'],
        freezerPk: ['3', '4'],
        depositFeeBps: 0,
      }),
    } as any;

    const publicClient = {
      readContract: async ({ functionName }: any) => {
        if (functionName === 'depositRelayerFee') return 7n;
        if (functionName === 'allowance') return 0n;
        throw new Error('unexpected');
      },
    } as any;

    const ops = new Ops(assets, {} as any, {} as any, {} as any, new TxBuilder(), { markSpent: async () => {} }, undefined, undefined);
    const res = await ops.prepareDeposit({
      chainId,
      assetId: '1',
      amount: 100n,
      ownerPublicKey: KeyManager.getPublicKeyBySeed('opsDeposit-test', '0'),
      account: '0x0000000000000000000000000000000000000003',
      publicClient,
    });

    expect(res.depositRelayerFee).toBe(7n);
    expect(res.approveNeeded).toBe(true);
    expect(res.approveRequest?.functionName).toBe('approve');
    expect(res.depositRequest.functionName).toBe('deposit');
    expect(res.depositRequest.args[4]).not.toBe('0x0');
    expect(res.memo).toBe(res.depositRequest.args[4]);
  });
});
