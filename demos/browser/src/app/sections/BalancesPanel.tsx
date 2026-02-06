import { useCallback, useState } from 'react';
import type { BalanceRow } from '../constants';
import { formatTokenAmount } from '../utils';
import { useDemoStore } from '../state/demoStore';
import { message } from 'antd';

export function BalancesPanel() {
  const { sdk, walletOpened, currentChain, currentTokens } = useDemoStore();
  const [balances, setBalances] = useState<BalanceRow[]>([]);

  const refreshBalances = useCallback(async () => {
    if (!sdk || !currentChain || !walletOpened) return;
    try {
      await sdk.sync.syncOnce({ chainIds: [currentChain.chainId] });
      const rows: BalanceRow[] = [];
      for (const token of currentTokens) {
        const value = await sdk.wallet.getBalance({ chainId: currentChain.chainId, assetId: token.id });
        rows.push({ token, value });
      }
      setBalances(rows);
    } catch (error) {
      message.error(error instanceof Error ? error.message : String(error));
    }
  }, [sdk, currentChain, walletOpened, currentTokens]);

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
