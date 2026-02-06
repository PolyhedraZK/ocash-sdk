import type { DemoController } from '../hooks/useDemoController';
import { formatTokenAmount } from '../utils';

export function UtxosPanel({
  utxos,
  utxoFilter,
  setUtxoFilter,
  utxoPage,
  setUtxoPage,
  utxoTotal,
  refreshUtxos,
  walletOpened,
  sdk,
  tokenInfoById,
}: Pick<
  DemoController,
  | 'utxos'
  | 'utxoFilter'
  | 'setUtxoFilter'
  | 'utxoPage'
  | 'setUtxoPage'
  | 'utxoTotal'
  | 'refreshUtxos'
  | 'walletOpened'
  | 'sdk'
  | 'tokenInfoById'
>) {
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
