import { useCallback, useState } from 'react';
import { useDemoStore } from '../store';

export function WalletPanel() {
  const { sdk, sdkStatus, setSdkStatus, walletOpened, setWalletOpened, viewingAddress, setViewingAddress, seed, accountNonce, chainId, address, isConnected, connectors, connect, disconnect, appendLog } = useDemoStore();
  const [progress, setProgress] = useState('');

  const handleConnect = useCallback(() => {
    const connector = connectors.find((c) => c.id === 'injected') ?? connectors[0];
    if (connector) connect({ connector });
  }, [connectors, connect]);

  const handleInit = useCallback(async () => {
    if (!sdk) return;
    setSdkStatus('loading');
    setProgress('Loading WASM and circuits...');
    try {
      await sdk.core.ready((pct) => setProgress(`Loading... ${Math.round(pct * 100)}%`));
      setProgress('Opening wallet...');
      const nonce = accountNonce != null ? String(accountNonce) : undefined;
      await sdk.wallet.open({ seed, accountNonce });
      const pub = sdk.keys.getPublicKeyBySeed(seed, nonce);
      const addr = sdk.keys.userPkToAddress(pub.user_pk);
      setViewingAddress(addr);
      setWalletOpened(true);
      setProgress('Starting sync...');
      await sdk.sync.start({ chainIds: [chainId], pollMs: 15_000 });
      setSdkStatus('ready');
      setProgress('');
      appendLog('init', 'SDK ready, wallet open, sync started');
    } catch (err) {
      setSdkStatus('error');
      setProgress('');
      appendLog('init', err instanceof Error ? err.message : String(err), 'error');
    }
  }, [sdk, seed, accountNonce, chainId, setSdkStatus, setWalletOpened, setViewingAddress, appendLog]);

  return (
    <div className="card">
      <h2>Wallet</h2>
      <div className="row">
        {isConnected ? (
          <>
            <span className="mono">{address}</span>
            <button className="secondary" onClick={() => disconnect()}>Disconnect</button>
          </>
        ) : (
          <button onClick={handleConnect}>Connect MetaMask</button>
        )}
      </div>
      {isConnected && (
        <div className="row" style={{ marginTop: 8 }}>
          <button onClick={handleInit} disabled={sdkStatus === 'loading' || sdkStatus === 'ready'}>
            {sdkStatus === 'ready' ? 'Initialized' : sdkStatus === 'loading' ? 'Initializing...' : 'Initialize SDK'}
          </button>
        </div>
      )}
      {progress && <div className="status">{progress}</div>}
      {viewingAddress && (
        <div style={{ marginTop: 8 }}>
          <label>Viewing Address</label>
          <div className="mono">{viewingAddress}</div>
        </div>
      )}
    </div>
  );
}
