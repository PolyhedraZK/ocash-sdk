import type { DemoController } from '../hooks/useDemoController';

export function AssetContextPanel({
  config,
  selectedChainId,
  setSelectedChainId,
  selectedTokenId,
  setSelectedTokenId,
  currentTokens,
}: Pick<
  DemoController,
  | 'config'
  | 'selectedChainId'
  | 'setSelectedChainId'
  | 'selectedTokenId'
  | 'setSelectedTokenId'
  | 'currentTokens'
>) {
  return (
    <section className="panel span-12">
      <h2>Asset Context</h2>
      <div className="row">
        <label className="label">Chain</label>
        <select value={selectedChainId ?? ''} onChange={(event) => setSelectedChainId(Number(event.target.value))}>
          {config.chains.map((chain) => (
            <option key={chain.chainId} value={chain.chainId}>
              {chain.chainId}
            </option>
          ))}
        </select>
        <label className="label">Token</label>
        <select value={selectedTokenId ?? ''} onChange={(event) => setSelectedTokenId(event.target.value)}>
          {currentTokens.map((token) => (
            <option key={token.id} value={token.id}>
              {token.symbol}
            </option>
          ))}
        </select>
      </div>
    </section>
  );
}
