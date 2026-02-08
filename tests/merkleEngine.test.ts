import { describe, expect, it, vi } from 'vitest';
import { MerkleEngine } from '../src/merkle/merkleEngine';
import { KeyManager } from '../src/crypto/keyManager';
import { MemoKit } from '../src/memo/memoKit';
import { CryptoToolkit } from '../src/crypto/cryptoToolkit';
import type { CommitmentData, ProofBridge } from '../src/types';

const bridge: ProofBridge = {
  init: async () => undefined,
  initTransfer: async () => undefined,
  initWithdraw: async () => undefined,
  proveTransfer: async () => '',
  proveWithdraw: async () => '',
  createMemo: () => '0x0',
  decryptMemo: () => null,
  commitment: () => '0x0',
  nullifier: () => '0x0',
  createDummyRecordOpening: async () => ({} as any),
  createDummyInputSecret: async () => ({ dummy: true } as any),
};

const deriveOwner = () => {
  const kp = KeyManager.deriveKeyPair('merkle-engine-test');
  return { user_pk: kp.user_pk, user_sk: kp.user_sk };
};

describe('MerkleEngine', () => {
  it('computes currentMerkleRootIndex', () => {
    const engine = new MerkleEngine(() => ({ merkleProofUrl: 'https://x.invalid' }), bridge);
    expect(engine.currentMerkleRootIndex(1)).toBe(0);
    expect(engine.currentMerkleRootIndex(32)).toBe(0);
    expect(engine.currentMerkleRootIndex(33)).toBe(1);
  });

  it('fetches remote proof with repeated cid query', async () => {
    const engine = new MerkleEngine(() => ({ merkleProofUrl: 'https://merkle.invalid' }), bridge);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        proof: [{ path: ['0', '1'], leaf_index: 0 }],
        merkle_root: '0x01',
        latest_cid: 0,
      }),
    });
    (globalThis as any).fetch = fetchMock;

    const res = await engine.getProofByCids({ chainId: 1, cids: [7], totalElements: 33n });
    expect(res.latest_cid).toBe(0);
    expect(fetchMock).toHaveBeenCalledWith('https://merkle.invalid/api/v1/merkle?cid=7', expect.objectContaining({ signal: expect.anything() }));
  });

  it('throws SdkError(MERKLE) when all utxos lack memos', async () => {
    const engine = new MerkleEngine(() => ({ merkleProofUrl: 'https://x.invalid' }), bridge);
    const owner = deriveOwner();
    const remote = { proof: [{ path: ['0', '1'], leaf_index: 0 }], merkle_root: '0x01', latest_cid: 0 } as any;

    await expect(
      engine.buildInputSecretsFromUtxos({
        remote,
        utxos: [{ commitment: '0x02', mkIndex: 0 }],
        ownerKeyPair: owner,
        arrayHash: 1n,
        totalElements: 1n,
      }),
    ).rejects.toMatchObject({ name: 'SdkError', code: 'MERKLE' });
  });

  it('builds acc_member_witness in circuits JSON shape', () => {
    const engine = new MerkleEngine(() => ({ merkleProofUrl: 'https://x.invalid' }), bridge);
    const remote = { proof: [{ path: ['0x02', '0x03'], leaf_index: '7' }], merkle_root: '0x01', latest_cid: 0 } as any;
    const [w] = engine.buildAccMemberWitnesses({ remote, utxos: [{ commitment: '0x02', mkIndex: 7 }], arrayHash: 0n, totalElements: 0n });
    expect(w).toEqual({ root: '1', path: ['2', '3'], index: 7 });
  });

  it('pads input secrets to maxInputs for transfer circuit', async () => {
    const owner = deriveOwner();
    const ro: CommitmentData = {
      asset_id: 1n,
      asset_amount: 2n,
      user_pk: { user_address: owner.user_pk.user_address },
      blinding_factor: 3n,
      is_frozen: false,
    };
    const memo = MemoKit.createMemo(ro);

    const engine = new MerkleEngine(() => ({ merkleProofUrl: 'https://x.invalid' }), bridge);

    const remote = { proof: [{ path: ['0x02', '0x03'], leaf_index: 0 }], merkle_root: '0x01', latest_cid: 0 } as any;

    const out = await engine.buildInputSecretsFromUtxos({
      remote,
      utxos: [{ commitment: '0x02', mkIndex: 0, memo }],
      ownerKeyPair: owner,
      arrayHash: 0n,
      totalElements: 1n,
      maxInputs: 3,
    });

    expect(out).toHaveLength(3);
    expect(out[1]).toMatchObject({ dummy: true });
    expect(out[2]).toMatchObject({ dummy: true });
  });
});
