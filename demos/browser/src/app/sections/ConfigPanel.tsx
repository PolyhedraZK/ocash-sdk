import type { DemoController } from '../hooks/useDemoController';

export function ConfigPanel({
  configText,
  initSdk,
  closeWallet,
  sdk,
  sdkStatus,
  walletOpened,
  statusLabel,
  coreProgress,
}: Pick<
  DemoController,
  | 'configText'
  | 'initSdk'
  | 'closeWallet'
  | 'sdk'
  | 'sdkStatus'
  | 'walletOpened'
  | 'statusLabel'
  | 'coreProgress'
>) {
  return (
    <section className="panel span-7">
      <div className="row">
        <div>
          <h2>Config</h2>
          <div className="label">SDK + Chain Settings</div>
        </div>
        <span className="badge">{statusLabel}</span>
      </div>
      <textarea value={configText} readOnly spellCheck={false} />
      <div className="row">
        <button className="secondary" onClick={initSdk} disabled={!sdk || sdkStatus === 'loading'}>
          Initialize SDK
        </button>
        <button className="secondary" onClick={closeWallet} disabled={!walletOpened}>
          Close Wallet
        </button>
        <div className="status">
          <span className={`status-dot ${sdkStatus === 'ready' ? 'ready' : sdkStatus === 'error' ? 'error' : ''}`} />
          <span>Core progress: {coreProgress}%</span>
        </div>
      </div>
    </section>
  );
}
