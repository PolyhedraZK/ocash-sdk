import type { DemoController } from '../hooks/useDemoController';

export function WalletPanel({
  isConnected,
  connectors,
  connect,
  disconnect,
  address,
  walletChainId,
  viewingAddress,
  viewingAddressFromSeed,
  config,
  chainMismatch,
  selectedChainId,
  currentChain,
  syncOnce,
  refreshOperations,
  sdk,
  walletOpened,
}: Pick<
  DemoController,
  | 'isConnected'
  | 'connectors'
  | 'connect'
  | 'disconnect'
  | 'address'
  | 'walletChainId'
  | 'viewingAddress'
  | 'viewingAddressFromSeed'
  | 'config'
  | 'chainMismatch'
  | 'selectedChainId'
  | 'currentChain'
  | 'syncOnce'
  | 'refreshOperations'
  | 'sdk'
  | 'walletOpened'
>) {
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
          <strong>Chain:</strong> {walletChainId ?? 'N/A'}
        </div>
        <div className="status">
          <strong>OCash Receive (nonce {config.accountNonce ?? 0}):</strong>{' '}
          <span className="mono">{viewingAddress ?? viewingAddressFromSeed ?? 'N/A'}</span>
        </div>
      </div>
      {chainMismatch && (
        <div className="notice">
          Wallet chain {walletChainId} does not match target chain {selectedChainId}. Please switch in your wallet.
        </div>
      )}
      {currentChain?.rpcUrl ? null : <div className="notice">Current chain missing rpcUrl.</div>}
      <div className="row">
        <button className="teal" onClick={syncOnce} disabled={!sdk || !walletOpened}>
          Sync Once
        </button>
        <button className="secondary" onClick={refreshOperations} disabled={!sdk}>
          Refresh Operations
        </button>
      </div>
    </section>
  );
}
