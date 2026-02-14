import type { SyncCursor, UtxoRecord } from '../../types';

export type PersistedUtxoRecord = Omit<UtxoRecord, 'amount'> & { amount: string };

export type PersistedWalletState = {
  walletId?: string;
  cursors: Record<string, SyncCursor>;
  utxos: Record<string, PersistedUtxoRecord>;
};

/**
 * Default cursor shape for new chains.
 */
export const defaultCursor = (): SyncCursor => ({ memo: 0, nullifier: 0, merkle: 0 });

/**
 * Serialize wallet state (convert bigint amounts to strings).
 */
export function serializeWalletState(input: { walletId?: string; cursors: Map<number, SyncCursor>; utxos: Map<string, UtxoRecord> }): PersistedWalletState {
  const cursors: PersistedWalletState['cursors'] = {};
  for (const [chainId, cursor] of input.cursors.entries()) {
    cursors[String(chainId)] = cursor;
  }

  const utxos: PersistedWalletState['utxos'] = {};
  for (const [key, utxo] of input.utxos.entries()) {
    utxos[key] = { ...utxo, amount: utxo.amount.toString() };
  }

  return { walletId: input.walletId, cursors, utxos };
}

/**
 * Hydrate wallet state from persisted JSON (convert amounts to bigint).
 */
export function hydrateWalletState(state: PersistedWalletState | undefined) {
  const cursors = new Map<number, SyncCursor>();
  const utxos = new Map<string, UtxoRecord>();

  for (const [k, v] of Object.entries(state?.cursors ?? {})) {
    const raw = (v ?? {}) as Partial<SyncCursor>;
    const memo = Number(raw.memo);
    const nullifier = Number(raw.nullifier);
    const merkle = Number(raw.merkle);
    cursors.set(Number(k), {
      memo: Number.isFinite(memo) ? memo : 0,
      nullifier: Number.isFinite(nullifier) ? nullifier : 0,
      merkle: Number.isFinite(merkle) ? merkle : 0,
    });
  }

  for (const [k, v] of Object.entries(state?.utxos ?? {})) {
    try {
      utxos.set(k, { ...v, amount: BigInt(v.amount) });
    } catch {
      // ignore bad utxo rows
    }
  }

  return { walletId: state?.walletId, cursors, utxos };
}
