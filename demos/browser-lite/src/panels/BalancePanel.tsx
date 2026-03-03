import { useCallback, useState } from 'react';
import { useDemoStore } from '../store';
import { formatAmount } from '../format';

export function BalancePanel() {
  const { sdk, walletOpened, chainId, token, appendLog } = useDemoStore();
  const [balance, setBalance] = useState<bigint | null>(null);
  const [loading, setLoading] = useState(false);

  const handleRefresh = useCallback(async () => {
    if (!sdk || !token) return;
    setLoading(true);
    try {
      await sdk.sync.syncOnce({ chainIds: [chainId] });
      const bal = await sdk.wallet.getBalance({ chainId, assetId: token.id });
      setBalance(bal);
      appendLog('balance', `${formatAmount(bal, token.decimals)} ${token.symbol}`);
    } catch (err) {
      appendLog('balance', err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setLoading(false);
    }
  }, [sdk, chainId, token, appendLog]);

  return (
    <div className="card">
      <h2>Shielded Balance</h2>
      <div className="row">
        <span className="balance-value">
          {balance != null && token ? formatAmount(balance, token.decimals) : '--'}
        </span>
        <span className="balance-symbol">{token?.symbol ?? ''}</span>
      </div>
      <div className="row" style={{ marginTop: 8 }}>
        <button onClick={handleRefresh} disabled={!walletOpened || loading}>
          {loading ? 'Syncing...' : 'Refresh'}
        </button>
      </div>
    </div>
  );
}
