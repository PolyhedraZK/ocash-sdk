import type { DemoController } from '../hooks/useDemoController';
import { formatTokenAmount } from '../utils';

export function BalancesPanel({
  balances,
  refreshBalances,
  walletOpened,
  sdk,
}: Pick<DemoController, 'balances' | 'refreshBalances' | 'walletOpened' | 'sdk'>) {
  return (
    <section className="panel span-6">
      <div className="row">
        <h2>Total Assets</h2>
        <button className="secondary" onClick={refreshBalances} disabled={!walletOpened || !sdk}>
          Refresh
        </button>
      </div>
      <div className="list">
        {balances.length === 0 && <div className="notice">No balance data loaded.</div>}
        {balances.map((row) => (
          <div key={row.token.id} className="list-item">
            <div className="row">
              <strong>{row.token.symbol}</strong>
              <span className="mono">{formatTokenAmount(row.value, row.token)}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
