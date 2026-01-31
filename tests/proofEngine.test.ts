import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProofEngine } from '../src/proof/proofEngine';
import { bigintReplacer } from '../src/utils/json';
import type {
  CommitmentData,
  ProofBridge,
  TransferWitnessInput,
  WitnessContext,
  WithdrawWitnessInput,
} from '../src/types';
import { createProofBridgeMock, type ProofBridgeMock } from './helpers';

const sampleCommitment = (overrides: Partial<CommitmentData> = {}): CommitmentData => ({
  asset_id: 1n,
  asset_amount: 1n,
  user_pk: { user_address: [1n, 2n] },
  blinding_factor: 1n,
  is_frozen: false,
  ...overrides,
});

const transferWitness = (): TransferWitnessInput => ({
  asset_id: '1',
  asset_token_id: '0x01',
  asset_policy: {
    viewer_pk: [1n, 2n],
    freezer_pk: [3n, 4n],
  },
  input_secrets: [],
  array: ['0x0'],
  fee: 3n,
  max_amount: 100n,
  output_record_openings: [sampleCommitment()],
  viewing_memo_randomness: new Uint8Array(32),
  proof_binding: '0xdead',
});

const withdrawWitness = (): WithdrawWitnessInput => ({
  asset_id: '1',
  asset_token_id: '0x01',
  asset_policy: {
    viewer_pk: [1n, 2n],
    freezer_pk: [3n, 4n],
  },
  input_secret: {
    owner_keypair: {
      user_pk: { user_address: [1n, 2n] },
      user_sk: { address_sk: '0x1' },
    },
    ro: sampleCommitment(),
    acc_member_witness: {
      root: '0x0',
      leaf: '0x0',
      index: 0,
      siblings: [],
      array_hash: '0x0',
      total_elements: 0,
    },
  },
  output_record_opening: sampleCommitment(),
  array: ['0x0'],
  amount: 10n,
  relayer_fee: 1n,
  gas_drop_value: 0n,
  viewing_memo_randomness: new Uint8Array(32),
  proof_binding: '0xbeef',
});

const proofPayload = {
  success: true,
  proof: ['0x1', '0x2', '0x3', '0x4', '0x5', '0x6', '0x7', '0x8'],
  flatten_input: ['0x1'],
  input: {
    nullifiers: ['0xaa'],
    commitments: ['0xbb'],
  },
  relayer_fee: '42',
};

const createEngine = (bridge: ProofBridgeMock, coreEmit = vi.fn()) =>
  new ProofEngine(bridge as unknown as ProofBridge, { emit: coreEmit } as any);

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ProofEngine witness helpers', () => {
  it('includes the context metadata when creating witnesses', async () => {
    const bridge = createProofBridgeMock();
    const engine = createEngine(bridge);
    const context: WitnessContext = {
      array_hash_index: 2,
      merkle_root_index: 3,
      relayer: '0xrelayer',
      extra_data: '0x1234',
      relayer_fee: 5n,
      gas_drop_value: 7n,
      array_hash_digest: '0xbeef',
    };
    const result = await engine.createWitnessTransfer(transferWitness(), context);
    expect(result).toMatchObject({
      witness_type: 'transfer',
      array_hash_index: 2,
      relayer: '0xrelayer',
      extra_data: '0x1234',
      relayer_fee: 5n,
      gas_drop_value: 7n,
      array_hash_digest: '0xbeef',
    });
    const withdrawResult = await engine.createWitnessWithdraw(withdrawWitness(), context);
    expect(withdrawResult.witness_type).toBe('withdraw');
  });
});

describe('ProofEngine proof lifecycle', () => {
  it('serializes bigint fields and merges proof context on success', async () => {
    const bridge = createProofBridgeMock();
    const emit = vi.fn();
    bridge.proveTransfer.mockResolvedValue(JSON.stringify(proofPayload));
    const engine = createEngine(bridge, emit);
    const context: WitnessContext = {
      array_hash_index: 11,
      merkle_root_index: 22,
      relayer: '0xrelayer',
      relayer_fee: 9n,
    };
    const result = await engine.proveTransfer(transferWitness(), context);
    expect(bridge.proveTransfer).toHaveBeenCalledTimes(1);
    const serialized = bridge.proveTransfer.mock.calls[0][0];
    const parsed = JSON.parse(serialized);
    expect(parsed.fee).toBe('3');
    expect(result).toMatchObject({
      proof: proofPayload.proof,
      flatten_input: proofPayload.flatten_input,
      relayer: '0xrelayer',
      array_hash_index: 11,
      merkle_root_index: 22,
      relayer_fee: 42n,
    });
    expect(emit.mock.calls.map((call) => call[0].type)).toEqual(['zkp:start', 'zkp:done']);
  });

  it('proxies string witnesses and handles withdraw proofs', async () => {
    const bridge = createProofBridgeMock();
    const emit = vi.fn();
    bridge.proveWithdraw.mockResolvedValue(
      JSON.stringify({
        ...proofPayload,
        input: undefined,
        public_input: { commitments: [], nullifiers: [] },
      }),
    );
    const engine = createEngine(bridge, emit);
    const witnessJson = JSON.stringify(withdrawWitness(), bigintReplacer);
    const ctx: WitnessContext = {
      recipient: '0x000000000000000000000000000000000000dead',
      withdraw_amount: 123n,
    };
    const result = await engine.proveWithdraw(witnessJson, ctx);
    expect(bridge.proveWithdraw).toHaveBeenCalledWith(witnessJson);
    expect(result.recipient).toBe(ctx.recipient);
    expect(result.withdraw_amount).toBe(ctx.withdraw_amount);
    expect(emit).toHaveBeenCalledWith(expect.objectContaining({ type: 'zkp:start' }));
  });

  it('emits an error when the bridge reports a failure', async () => {
    const bridge = createProofBridgeMock();
    const emit = vi.fn();
    bridge.proveTransfer.mockResolvedValue(JSON.stringify({ success: false, err: 'boom' }));
    const engine = createEngine(bridge, emit);
    await expect(engine.proveTransfer(transferWitness(), {})).rejects.toThrow('boom');
    expect(emit).toHaveBeenCalledWith(expect.objectContaining({ type: 'error' }));
  });
});
