import { describe, expect, it } from 'vitest';
import { TxBuilder } from '../src/tx/txBuilder';

const dummyProof = (): any => ({
  proof: Array.from({ length: 8 }, () => '0') as any,
  flatten_input: [],
  public_input: {},
});

describe('TxBuilder', () => {
  it('builds transfer relayer request', async () => {
    const tx = new TxBuilder();
    const proof = {
      ...dummyProof(),
      array_hash_index: 1,
      merkle_root_index: 2,
      relayer: '0x0000000000000000000000000000000000000001',
      extra_data: ['0x01', '0x02', '0x03'],
    };
    const req = (await tx.buildTransferCalldata({ chainId: 1, proof })) as any;
    expect(req.kind).toBe('relayer');
    expect(req.path).toBe('/api/v1/transfer');
    expect(req.body.extra_data).toHaveLength(3);
  });

  it('builds withdraw relayer request', async () => {
    const tx = new TxBuilder();
    const proof = {
      ...dummyProof(),
      array_hash_index: 1,
      merkle_root_index: 2,
      relayer: '0x0000000000000000000000000000000000000001',
      recipient: '0x0000000000000000000000000000000000000002',
      withdraw_amount: 123n,
      relayer_fee: 1n,
      gas_drop_value: 0n,
      extra_data: '0x01',
    };
    const req = (await tx.buildWithdrawCalldata({ chainId: 1, proof })) as any;
    expect(req.kind).toBe('relayer');
    expect(req.path).toBe('/api/v1/burn');
    expect(req.body.burn_amount).toBe('123');
  });
});

