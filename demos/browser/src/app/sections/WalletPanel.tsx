import { useCallback, useEffect } from 'react';
import { sepolia } from 'viem/chains';
import { useDemoStore } from '../state/demoStore';

export function WalletPanel() {
  const {
    isConnected,
    connectors,
    connect,
    disconnect,
    address,
    walletChainId,
    viewingAddress,
    viewingAddressFromSeed,
    config,
    selectedChainId,
    currentChain,
    sdk,
    walletOpened,
    sdkStatus,
    setSdkStatus,
    setWalletOpened,
    setViewingAddress,
  } = useDemoStore();

  const chainMismatch = Boolean(walletChainId && selectedChainId && walletChainId !== selectedChainId);

  const initSdk = useCallback(async () => {
    if (!sdk) return;
    setSdkStatus('loading');
    try {
      await sdk.core.ready();
      await sdk.wallet.open({ seed: config.seed, accountNonce: config.accountNonce });
      setSdkStatus('ready');
      setWalletOpened(true);
      setViewingAddress(viewingAddressFromSeed ?? null);
    } catch (error) {
      setSdkStatus('error');
      message.error(error instanceof Error ? error.message : String(error));
    }
  }, [sdk, config.seed, config.accountNonce, viewingAddressFromSeed, setSdkStatus, setWalletOpened, setViewingAddress]);

  useEffect(() => {
    if (!isConnected || !sdk) return;
    if (sdkStatus !== 'idle' || walletOpened) return;
    initSdk();
  }, [isConnected, sdk, sdkStatus, walletOpened, initSdk]);

  return (
    <section className="panel span-5">
      <h2>Wallet</h2>
      <div className="row">
        {isConnected ? (
          <button className="secondary" onClick={() => disconnect()}>
            Disconnect
          </button>
        ) : (
          connectors.map((connector) => (
            <button key={connector.uid} onClick={() => connect({ connector })}>
              Connect {connector.name}
            </button>
          ))
        )}
      </div>
      <div className="stack">
        <div className="status">
          <strong>Wallet:</strong> {address ?? 'Not connected'}
        </div>
        <div className="status">
          <strong>Ocash:</strong>{' '}
          <a href={`${sepolia.blockExplorers?.default.url}/address/${config.chains?.[0]?.ocashContractAddress}`} target="_blank" rel="noopener noreferrer">
            {config.chains?.[0]?.ocashContractAddress ?? 'Not ocashContractAddress'}
          </a>
        </div>
        <div className="status">
          <strong>Chain:</strong> {walletChainId ?? 'N/A'}
        </div>
        <div className="status">
          <strong>OCash Receive (nonce {config.accountNonce ?? 0}):</strong> <span className="mono">{viewingAddress ?? viewingAddressFromSeed ?? 'N/A'}</span>
        </div>
      </div>
      {chainMismatch && (
        <div className="notice">
          Wallet chain {walletChainId} does not match target chain {selectedChainId}. Please switch in your wallet.
        </div>
      )}
      {currentChain?.rpcUrl ? null : <div className="notice">Current chain missing rpcUrl.</div>}
    </section>
  );
}
