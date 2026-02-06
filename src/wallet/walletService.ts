import type { AssetsApi, ChainConfigInput, Hex, ListUtxosQuery, ListUtxosResult, StorageAdapter, UtxoRecord, WalletSessionInput } from '../types';
import { SdkError } from '../errors';
import { KeyManager } from '../crypto/keyManager';
import { CryptoToolkit } from '../crypto/cryptoToolkit';
import { MemoKit } from '../memo/memoKit';

type AssetLookup = {
  assetId: string;
  viewerPk: [bigint, bigint];
  freezerPk: [bigint, bigint];
};

const normalizeSeed = (seed: string | Uint8Array): string => {
  if (typeof seed === 'string') return seed;
  return Array.from(seed, (b) => b.toString(16).padStart(2, '0')).join('');
};

const toBigintPoint = (input: [string, string]): [bigint, bigint] => [BigInt(input[0]), BigInt(input[1])];

export class WalletService {
  private opened = false;
  private secretKey: bigint | null = null;
  private address: Hex | null = null;
  private assetByChainPoolId = new Map<string, AssetLookup>();

  constructor(
    private readonly assets: AssetsApi,
    private readonly storage: StorageAdapter,
    private readonly emit: (evt: any) => void,
  ) {}

  async open(session: WalletSessionInput) {
    const seed = normalizeSeed(session.seed);
    const nonce = session.accountNonce != null ? String(session.accountNonce) : undefined;
    const keyPair = KeyManager.deriveKeyPair(seed, nonce);
    this.secretKey = keyPair.user_sk.address_sk;
    this.address = KeyManager.userPkToAddress(keyPair.user_pk);
    this.assetByChainPoolId = this.buildAssetLookup(this.assets.getChains());
    await this.storage.init?.({ walletId: this.address });
    this.opened = true;
  }

  async close() {
    this.opened = false;
    this.secretKey = null;
    this.address = null;
    await this.storage.close?.();
  }

  getViewingAddress(): Hex {
    if (!this.opened || !this.address) {
      throw new SdkError('CONFIG', 'Wallet is not opened');
    }
    return this.address;
  }

  private getSecretKey(): bigint {
    if (!this.opened || this.secretKey == null) {
      throw new SdkError('CONFIG', 'Wallet is not opened');
    }
    return this.secretKey;
  }

  async getUtxos(query?: ListUtxosQuery): Promise<ListUtxosResult> {
    this.getViewingAddress();
    return this.storage.listUtxos(query);
  }

  async getBalance(query?: { chainId?: number; assetId?: string }): Promise<bigint> {
    const utxosResult = await this.storage.listUtxos({
      chainId: query?.chainId,
      assetId: query?.assetId,
      includeSpent: false,
      includeFrozen: false,
    });
    return utxosResult.rows.reduce((sum, utxo) => sum + utxo.amount, 0n);
  }

  async markSpent(input: { chainId: number; nullifiers: Hex[] }) {
    this.getViewingAddress();
    const updated = await this.storage.markSpent({ chainId: input.chainId, nullifiers: input.nullifiers });
    if (updated > 0) {
      this.emit({ type: 'wallet:utxo:update', payload: { chainId: input.chainId, added: 0, spent: updated, frozen: 0 } });
    }
  }

  async applyMemos(
    chainId: number,
    memos: Array<{
      memo: Hex;
      commitment: Hex;
      cid: number | null;
      created_at?: number | null;
      is_transparent?: boolean;
      asset_id?: Hex | null;
      amount?: Hex | null;
      partial_hash?: Hex | null;
    }>,
  ): Promise<number> {
    this.getViewingAddress();
    const secretKey = this.getSecretKey();
    const addedByKey = new Map<string, UtxoRecord>();
    let refreshedAssets = false;
    for (const entry of memos) {
      if (typeof entry.cid !== 'number' || !Number.isInteger(entry.cid) || entry.cid < 0) continue;
      const ro = MemoKit.decodeMemoForOwner({
        secretKey,
        memo: entry.memo,
        expectedAddress: this.address,
        isTransparent: entry.is_transparent,
      });
      if (!ro) continue;
      if (entry.amount && entry.asset_id && entry.partial_hash) {
        try {
          ro.asset_id = BigInt(entry.asset_id);
          ro.asset_amount = BigInt(entry.amount);
        } catch {
          // ignore overrides if payload is malformed
        }
      }
      const localCommitment = CryptoToolkit.commitment(ro, 'hex');
      if (localCommitment.toLowerCase() !== entry.commitment.toLowerCase()) continue;
      const poolKey = ro.asset_id.toString();
      const lookupKey = `${chainId}:${poolKey}`;
      let asset = this.assetByChainPoolId.get(lookupKey);
      if (!asset && !refreshedAssets) {
        refreshedAssets = true;
        this.assetByChainPoolId = this.buildAssetLookup(this.assets.getChains());
        asset = this.assetByChainPoolId.get(lookupKey);
      }
      const nullifier = CryptoToolkit.nullifier(secretKey, localCommitment, asset?.freezerPk);
      const mkIndex = entry.cid;
      const utxo: UtxoRecord = {
        chainId,
        assetId: asset?.assetId ?? poolKey,
        amount: ro.asset_amount,
        commitment: localCommitment,
        nullifier,
        mkIndex,
        isFrozen: ro.is_frozen,
        isSpent: false,
        memo: entry.memo,
        createdAt: entry.created_at ?? undefined,
      };
      const utxoKey = `${chainId}:${localCommitment.toLowerCase()}`;
      if (!addedByKey.has(utxoKey)) addedByKey.set(utxoKey, utxo);
    }
    const added = Array.from(addedByKey.values());
    if (!added.length) return 0;
    await this.storage.upsertUtxos(added);
    const frozen = added.filter((u) => u.isFrozen).length;
    this.emit({ type: 'wallet:utxo:update', payload: { chainId, added: added.length, spent: 0, frozen } });
    return added.length;
  }

  private buildAssetLookup(chains: ChainConfigInput[]) {
    const map = new Map<string, AssetLookup>();
    for (const chain of chains) {
      for (const token of chain.tokens ?? []) {
        const viewerPk = toBigintPoint(token.viewerPk);
        const freezerPk = toBigintPoint(token.freezerPk);
        const poolId = CryptoToolkit.poolId(token.wrappedErc20, viewerPk, freezerPk);
        map.set(`${chain.chainId}:${poolId.toString()}`, { assetId: token.id, viewerPk, freezerPk });
      }
    }
    return map;
  }
}
