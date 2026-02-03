import { describe, expect, it, vi } from 'vitest';
import { Ops } from '../src/ops/ops';
import { TxBuilder } from '../src/tx/txBuilder';

const dummyProofBase = () => ({
  proof: Array.from({ length: 8 }, () => '0') as any,
  flatten_input: [] as string[],
  public_input: {} as Record<string, any>,
});
const wallet = { markSpent: async () => {} };

describe('Ops.prepareTransfer / Ops.prepareWithdraw', () => {
  it('wraps non-SdkError planner errors as SdkError(CONFIG)', async () => {
    const ops = new Ops(
      {
        getChain: () => ({
          chainId: 1,
          ocashContractAddress: '0x0000000000000000000000000000000000000001',
          relayerUrl: 'https://relayer.example',
        }),
        syncRelayerConfig: vi.fn(async () => ({
          config: { relayer_address: '0x00000000000000000000000000000000000000aa' },
          fee_configure: { valid_time: 0, transfer: {}, withdraw: {} },
        })),
      } as any,
      { plan: vi.fn(async () => Promise.reject(new Error('boom'))) } as any,
      {} as any,
      {} as any,
      new TxBuilder(),
      wallet,
      undefined,
      undefined,
    );

    await expect(
      ops.prepareTransfer({
        chainId: 1,
        assetId: '1',
        amount: 1n,
        to: '0x0000000000000000000000000000000000000005',
        ownerKeyPair: {} as any,
        publicClient: {} as any,
      }),
    ).rejects.toMatchObject({ name: 'SdkError', code: 'CONFIG', message: 'prepareTransfer planner failed' });
  });

  it('prepareTransfer wires plan -> merkle -> witness -> proof -> relayer request and picks next merkleRootIndex', async () => {
    const chainId = 1;
    const ocashContractAddress = '0x0000000000000000000000000000000000000001';
    const relayerUrl = 'https://relayer.example';
    const relayerAddress = '0x00000000000000000000000000000000000000aa';

    const selectedInputs = [
      { mkIndex: 10, commitment: '0x01', memo: '0x02' },
      { mkIndex: 11, commitment: '0x03', memo: '0x04' },
    ];

    const plan = {
      action: 'transfer' as const,
      chainId,
      assetId: '1',
      token: {
        id: '1',
        wrappedErc20: '0x0000000000000000000000000000000000000002',
        viewerPk: ['1', '2'],
        freezerPk: ['3', '4'],
        transferMaxAmount: 0n,
      },
      requestedAmount: 100n,
      sendAmount: 100n,
      to: '0x0000000000000000000000000000000000000005',
      required: 100n,
      selectedSum: 200n,
      relayer: relayerAddress,
      relayerUrl,
      relayerFee: 7n,
      extraData: ['0x01', '0x02', '0x03'],
      outputs: [{}, {}, {}],
      selectedInputs,
      proofBinding: 'binding',
    };

    const remoteRoot = 777n;
    const merkle = {
      getProofByCids: vi.fn(async () => ({ merkle_root: remoteRoot.toString(), latest_cid: 63, proof: [] })),
      currentMerkleRootIndex: vi.fn(() => 1),
      buildInputSecretsFromUtxos: vi.fn(async () => [{}, {}]),
    } as any;

    const zkp = {
      proveTransfer: vi.fn(async (_witness: any, context: any) => ({
        ...dummyProofBase(),
        array_hash_index: context.array_hash_index,
        merkle_root_index: context.merkle_root_index,
        relayer: context.relayer,
        extra_data: context.extra_data,
      })),
    } as any;

    const planner = {
      plan: vi.fn(async () => plan),
    } as any;

    const assets = {
      getChain: () => ({ chainId, ocashContractAddress, relayerUrl }),
    } as any;

    const publicClient = {
      readContract: vi.fn(async ({ functionName, args }: any) => {
        if (functionName === 'getArray') return [1n, 2n, 3n];
        if (functionName === 'digest') return [0n, 123n];
        if (functionName === 'totalElements') return 5n;
        if (functionName === 'merkleRoots') {
          const idx = Number(args?.[0] ?? 0);
          if (idx === 2) return remoteRoot;
          return 0n;
        }
        throw new Error(`unexpected ${functionName}`);
      }),
    } as any;

    const ops = new Ops(assets, planner, merkle, zkp, new TxBuilder(), wallet, undefined, undefined);
    const res = await ops.prepareTransfer({
      chainId,
      assetId: '1',
      amount: 100n,
      to: '0x0000000000000000000000000000000000000005',
      ownerKeyPair: {} as any,
      publicClient,
    });

    expect(planner.plan).toHaveBeenCalled();
    expect(merkle.getProofByCids).toHaveBeenCalledWith({ chainId, cids: [10, 11], totalElements: 5n });
    expect(merkle.buildInputSecretsFromUtxos).toHaveBeenCalled();
    expect(zkp.proveTransfer).toHaveBeenCalled();

    expect(res.meta.arrayHashIndex).toBe(4);
    expect(res.meta.merkleRootIndex).toBe(2);
    expect(res.meta.relayer).toBe(relayerAddress);

    expect(res.witness.fee).toBe(7n);
    expect(res.witness.proof_binding).toBe('binding');
    expect(res.witness.asset_policy.viewer_pk).toMatchObject({ EncryptionKey: { Key: { X: 1n, Y: 2n } } });
    expect(res.witness.asset_policy.freezer_pk).toMatchObject({ Point: { X: 3n, Y: 4n } });
    expect(res.request.path).toBe('/api/v1/transfer');
  });

  it('wraps non-SdkError proof errors as SdkError(PROOF)', async () => {
    const chainId = 1;
    const ocashContractAddress = '0x0000000000000000000000000000000000000001';
    const relayerUrl = 'https://relayer.example';
    const relayerAddress = '0x00000000000000000000000000000000000000aa';

    const plan = {
      action: 'transfer' as const,
      chainId,
      assetId: '1',
      token: {
        id: '1',
        wrappedErc20: '0x0000000000000000000000000000000000000002',
        viewerPk: ['1', '2'],
        freezerPk: ['3', '4'],
        transferMaxAmount: 0n,
      },
      requestedAmount: 100n,
      sendAmount: 100n,
      to: '0x0000000000000000000000000000000000000005',
      required: 100n,
      selectedSum: 100n,
      relayer: relayerAddress,
      relayerUrl,
      relayerFee: 7n,
      extraData: ['0x01', '0x02', '0x03'],
      outputs: [{}, {}, {}],
      selectedInputs: [{ mkIndex: 1, commitment: '0x01', memo: '0x02' }],
      proofBinding: 'binding',
    };

    const ops = new Ops(
      {
        getChain: () => ({ chainId, ocashContractAddress, relayerUrl }),
      } as any,
      { plan: vi.fn(async () => plan) } as any,
      {
        getProofByCids: vi.fn(async () => ({ merkle_root: '1', latest_cid: 0, proof: [] })),
        currentMerkleRootIndex: vi.fn(() => 0),
        buildInputSecretsFromUtxos: vi.fn(async () => [{}]),
      } as any,
      { proveTransfer: vi.fn(async () => Promise.reject(new Error('prove boom'))) } as any,
      new TxBuilder(),
      wallet,
      undefined,
      undefined,
    );

    const publicClient = {
      readContract: vi.fn(async ({ functionName }: any) => {
        if (functionName === 'getArray') return [1n];
        if (functionName === 'digest') return [0n, 123n];
        if (functionName === 'totalElements') return 1n;
        if (functionName === 'merkleRoots') return 1n;
        throw new Error('unexpected');
      }),
    } as any;

    await expect(
      ops.prepareTransfer({
        chainId,
        assetId: '1',
        amount: 100n,
        to: '0x0000000000000000000000000000000000000005',
        ownerKeyPair: {} as any,
        publicClient,
      }),
    ).rejects.toMatchObject({ name: 'SdkError', code: 'PROOF', message: 'prepareTransfer proof failed' });
  });

  it('throws SdkError(MERKLE) when remote root is not found on-chain', async () => {
    const chainId = 1;
    const ocashContractAddress = '0x0000000000000000000000000000000000000001';
    const relayerUrl = 'https://relayer.example';
    const relayerAddress = '0x00000000000000000000000000000000000000aa';

    const plan = {
      action: 'transfer' as const,
      chainId,
      assetId: '1',
      token: {
        id: '1',
        wrappedErc20: '0x0000000000000000000000000000000000000002',
        viewerPk: ['1', '2'],
        freezerPk: ['3', '4'],
        transferMaxAmount: 0n,
      },
      requestedAmount: 100n,
      sendAmount: 100n,
      to: '0x0000000000000000000000000000000000000005',
      required: 100n,
      selectedSum: 100n,
      relayer: relayerAddress,
      relayerUrl,
      relayerFee: 7n,
      extraData: ['0x01', '0x02', '0x03'],
      outputs: [{}, {}, {}],
      selectedInputs: [{ mkIndex: 1, commitment: '0x01', memo: '0x02' }],
      proofBinding: 'binding',
    };

    const ops = new Ops(
      {
        getChain: () => ({ chainId, ocashContractAddress, relayerUrl }),
      } as any,
      { plan: vi.fn(async () => plan) } as any,
      {
        getProofByCids: vi.fn(async () => ({ merkle_root: '123', latest_cid: 0, proof: [] })),
        currentMerkleRootIndex: vi.fn(() => 0),
        buildInputSecretsFromUtxos: vi.fn(async () => [{}]),
      } as any,
      { proveTransfer: vi.fn(async () => ({ ...dummyProofBase(), extra_data: ['0x01', '0x02', '0x03'] })) } as any,
      new TxBuilder(),
      wallet,
      undefined,
      undefined,
    );

    const publicClient = {
      readContract: vi.fn(async ({ functionName }: any) => {
        if (functionName === 'getArray') return [1n];
        if (functionName === 'digest') return [0n, 123n];
        if (functionName === 'totalElements') return 1n;
        if (functionName === 'merkleRoots') return 999n;
        throw new Error('unexpected');
      }),
    } as any;

    await expect(
      ops.prepareTransfer({
        chainId,
        assetId: '1',
        amount: 100n,
        to: '0x0000000000000000000000000000000000000005',
        ownerKeyPair: {} as any,
        publicClient,
      }),
    ).rejects.toMatchObject({ name: 'SdkError', code: 'MERKLE', message: 'Remote merkle root not found on-chain' });
  });

  it('prepareWithdraw wires plan -> merkle -> witness -> proof -> relayer request and passes withdraw context', async () => {
    const chainId = 1;
    const ocashContractAddress = '0x0000000000000000000000000000000000000001';
    const relayerUrl = 'https://relayer.example';
    const relayerAddress = '0x00000000000000000000000000000000000000aa';

    const utxo = { mkIndex: 10, commitment: '0x01', memo: '0x02', amount: 1000n };
    const burnAmount = 123n;
    const relayerFee = 7n;
    const gasDropValue = 9n;
    const recipient = '0x0000000000000000000000000000000000000006';

    const plan = {
      action: 'withdraw' as const,
      chainId,
      assetId: '1',
      token: {
        id: '1',
        wrappedErc20: '0x0000000000000000000000000000000000000002',
        viewerPk: ['1', '2'],
        freezerPk: ['3', '4'],
        withdrawMaxAmount: 0n,
      },
      requestedAmount: 100n,
      protocolFee: 0n,
      relayer: relayerAddress,
      relayerUrl,
      relayerFee,
      burnAmount,
      gasDropValue,
      selectedInput: utxo,
      outputRecordOpening: {},
      extraData: '0x01',
      proofBinding: 'binding',
      recipient,
    };

    const remoteRoot = 999n;
    const merkle = {
      getProofByCids: vi.fn(async () => ({ merkle_root: remoteRoot.toString(), latest_cid: 63, proof: [] })),
      currentMerkleRootIndex: vi.fn(() => 1),
      buildInputSecretsFromUtxos: vi.fn(async () => [{}]),
    } as any;

    const zkp = {
      proveWithdraw: vi.fn(async (_witness: any, context: any) => ({
        ...dummyProofBase(),
        array_hash_index: context.array_hash_index,
        merkle_root_index: context.merkle_root_index,
        relayer: context.relayer,
        recipient: context.recipient,
        withdraw_amount: context.withdraw_amount,
        relayer_fee: context.relayer_fee,
        gas_drop_value: context.gas_drop_value,
        extra_data: context.extra_data,
      })),
    } as any;

    const planner = {
      plan: vi.fn(async () => plan),
    } as any;

    const assets = {
      getChain: () => ({ chainId, ocashContractAddress, relayerUrl }),
    } as any;

    const publicClient = {
      readContract: vi.fn(async ({ functionName, args }: any) => {
        if (functionName === 'getArray') return [1n, 2n, 3n];
        if (functionName === 'digest') return [0n, 123n];
        if (functionName === 'totalElements') return 5n;
        if (functionName === 'merkleRoots') {
          const idx = Number(args?.[0] ?? 0);
          if (idx === 1) return remoteRoot;
          return 0n;
        }
        throw new Error(`unexpected ${functionName}`);
      }),
    } as any;

    const ops = new Ops(assets, planner, merkle, zkp, new TxBuilder(), wallet, undefined, undefined);
    const res = await ops.prepareWithdraw({
      chainId,
      assetId: '1',
      amount: 100n,
      recipient: recipient as any,
      ownerKeyPair: {} as any,
      publicClient,
      gasDropValue,
    });

    expect(planner.plan).toHaveBeenCalled();
    expect(merkle.getProofByCids).toHaveBeenCalledWith({ chainId, cids: [10], totalElements: 5n });
    expect(zkp.proveWithdraw).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ recipient, withdraw_amount: burnAmount }));

    expect(res.meta.arrayHashIndex).toBe(4);
    expect(res.meta.merkleRootIndex).toBe(1);
    expect(res.meta.relayer).toBe(relayerAddress);

    expect(res.witness.proof_binding).toBe('binding');
    expect(res.witness.asset_policy.viewer_pk).toMatchObject({ EncryptionKey: { Key: { X: 1n, Y: 2n } } });
    expect(res.witness.asset_policy.freezer_pk).toMatchObject({ Point: { X: 3n, Y: 4n } });
    expect(res.request.path).toBe('/api/v1/burn');
    expect((res.request.body as any).burn_amount).toBe(burnAmount.toString());
    expect((res.request.body as any).gas_drop_value).toBe(gasDropValue.toString());
    expect((res.request.body as any).relayer_fee).toBe(relayerFee.toString());
  });
});
