import { describe, expect, it } from 'vitest';
import { WalletService } from '../src/wallet/walletService';
import { MemoryStore } from '../src/store/memoryStore';
import { KeyManager } from '../src/crypto/keyManager';
import { CryptoToolkit } from '../src/crypto/cryptoToolkit';
import { MemoKit } from '../src/memo/memoKit';
import { BabyJubjub } from '../src/crypto/babyJubjub';

describe('WalletService.applyMemos', () => {
  it('skips memos with cid=null (non-spendable)', async () => {
    const seed = 'wallet_seed';
    const keyPair = KeyManager.deriveKeyPair(seed);
    const ro = CryptoToolkit.createRecordOpening({
      asset_id: 1n,
      asset_amount: 10n,
      user_pk: { user_address: keyPair.user_pk.user_address },
    });
    const memo = MemoKit.createMemo(ro);
    const commitment = CryptoToolkit.commitment(ro, 'hex');

    const store = new MemoryStore();
    const assets = { getChains: () => [] };
    const wallet = new WalletService(assets as any, store, () => undefined);
    await wallet.open({ seed });

    const applied = await wallet.applyMemos(1, [{ memo, commitment, cid: null }]);
    expect(applied).toBe(0);
    await expect(wallet.getUtxos({ chainId: 1 })).resolves.toEqual([]);
  });

  it('uses chain-scoped asset lookup and refreshes lookup when chains update', async () => {
    const seed = 'wallet_seed';
    const keyPair = KeyManager.deriveKeyPair(seed);

    // Same policy/address on two chains, different token ids -> must pick by chainId.
    const viewerPoint = BabyJubjub.scalarMult(5n);
    const freezerPoint = BabyJubjub.scalarMult(7n);
    const viewerPk: [string, string] = [viewerPoint[0].toString(), viewerPoint[1].toString()];
    const freezerPk: [string, string] = [freezerPoint[0].toString(), freezerPoint[1].toString()];
    const wrappedErc20 = '0x0000000000000000000000000000000000000001';
    const poolId = CryptoToolkit.poolId(wrappedErc20, viewerPoint, freezerPoint);

    const ro = CryptoToolkit.createRecordOpening({
      asset_id: poolId,
      asset_amount: 10n,
      user_pk: { user_address: keyPair.user_pk.user_address },
    });
    const memo = MemoKit.createMemo(ro);
    const commitment = CryptoToolkit.commitment(ro, 'hex');

    let chains: any[] = [];
    const assets = { getChains: () => chains };
    const store = new MemoryStore();
    const wallet = new WalletService(assets as any, store, () => undefined);
    await wallet.open({ seed });

    chains = [
      { chainId: 1, tokens: [{ id: 'tokenA', wrappedErc20, viewerPk, freezerPk }] },
      { chainId: 2, tokens: [{ id: 'tokenB', wrappedErc20, viewerPk, freezerPk }] },
    ];

    const applied = await wallet.applyMemos(1, [{ memo, commitment, cid: 0 }]);
    expect(applied).toBe(1);

    const utxos = await wallet.getUtxos({ chainId: 1 });
    expect(utxos).toHaveLength(1);
    expect(utxos[0]!.assetId).toBe('tokenA');
    expect(utxos[0]!.nullifier).toBe(CryptoToolkit.nullifier(keyPair.user_sk.address_sk, commitment, freezerPoint));
  });
});
