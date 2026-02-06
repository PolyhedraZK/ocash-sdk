import { useCallback, useEffect, useState } from 'react';
import type { UtxoRecord } from '@ocash/sdk';
import { formatTokenAmount } from '../utils';
import { useDemoStore } from '../state/demoStore';
import { message } from 'antd';

export function UtxosPanel() {
  const { sdk, walletOpened, currentChain, selectedTokenId, tokenInfoById } = useDemoStore();
  const [utxos, setUtxos] = useState<UtxoRecord[]>([]);
  const [utxoFilter, setUtxoFilter] = useState<'all' | 'unspent' | 'spent'>('unspent');
  const [utxoPage, setUtxoPage] = useState(1);
  const [utxoTotal, setUtxoTotal] = useState(0);

  useEffect(() => {
    setUtxoPage(1);
  }, [currentChain?.chainId, selectedTokenId, utxoFilter]);

  const refreshUtxos = useCallback(async () => {
    if (!sdk || !currentChain || !walletOpened) return;
    const limit = 20;
    const offset = (utxoPage - 1) * limit;
    const spent = utxoFilter === 'spent' ? true : utxoFilter === 'unspent' ? false : undefined;
    try {
      const result = await sdk.wallet.getUtxos({
        chainId: currentChain.chainId,
        assetId: selectedTokenId ?? undefined,
        includeSpent: utxoFilter === 'all',
        spent,
        offset,
        limit,
        orderBy: 'mkIndex',
        order: 'desc',
      });
      const total = result.total;
      const maxPage = Math.max(1, Math.ceil(total / limit));
      if (utxoPage > maxPage) {
        setUtxoPage(maxPage);
        setUtxos([]);
        setUtxoTotal(total);
        return;
      }
      setUtxos(result.rows);
      setUtxoTotal(total);
    } catch (error) {
      message.error(error instanceof Error ? error.message : String(error));
    }
  }, [sdk, currentChain, walletOpened, utxoPage, utxoFilter, selectedTokenId]);

  useEffect(() => {
    void refreshUtxos();
  }, [refreshUtxos]);

  const maxPage = Math.max(1, Math.ceil(utxoTotal / 20));

  return (
    <section className="panel span-6">
      <div className="row">
        <h2>UTXOs</h2>
        <select value={utxoFilter} onChange={(event) => setUtxoFilter(event.target.value as typeof utxoFilter)}>
          <option value="unspent">Unspent</option>
          <option value="spent">Spent</option>
          <option value="all">All</option>
        </select>
        <button className="secondary" onClick={refreshUtxos} disabled={!walletOpened || !sdk}>
          Refresh
        </button>
      </div>
      <div className="row">
        <button className="secondary" onClick={() => setUtxoPage(utxoPage - 1)} disabled={utxoPage <= 1}>
          Prev
        </button>
        <button className="secondary" onClick={() => setUtxoPage(utxoPage + 1)} disabled={utxoPage >= maxPage}>
          Next
        </button>
        <span className="status">
          Page {utxoPage}/{maxPage} (Total {utxoTotal})
        </span>
      </div>
      <div className="list">
        {utxos.length === 0 && <div className="notice">No UTXOs found for current filter.</div>}
        {utxos.map((utxo) => (
          <div key={`${utxo.chainId}-${utxo.commitment}`} className="list-item">
            <div className="row">
              <strong>{tokenInfoById.get(utxo.assetId)?.symbol ?? utxo.assetId}</strong>
              <span className="mono">{formatTokenAmount(utxo.amount, tokenInfoById.get(utxo.assetId))}</span>
            </div>
            <div className="mono">commitment: {utxo.commitment}</div>
            <div className="mono">nullifier: {utxo.nullifier}</div>
            <div className="status">
              spent: {String(utxo.isSpent)} | frozen: {String(utxo.isFrozen)}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
