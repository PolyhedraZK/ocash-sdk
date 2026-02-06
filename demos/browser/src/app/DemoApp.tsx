import type { DemoConfig } from './constants';
import { DemoProvider } from './state/demoStore';
import { BalancesPanel, ConfigPanel, DepositPanel, EntryMemosPanel, EntryNullifiersPanel, OperationsPanel, TransferPanel, UtxosPanel, WalletPanel, WithdrawPanel } from './sections';

export function DemoApp({ config }: { config: DemoConfig }) {
  return (
    <DemoProvider config={config}>
      <div className="app">
        <div className="header">
          <h1>OCash SDK Browser Demo</h1>
          <p>Browser SDK + wagmi/viem wallet flow for deposit, transfer, withdraw, and history.</p>
        </div>

        <div className="grid">
          <ConfigPanel />
          <WalletPanel />
          <DepositPanel />
          <TransferPanel />
          <WithdrawPanel />
          <BalancesPanel />
          <UtxosPanel />
          <EntryMemosPanel />
          <EntryNullifiersPanel />
          <OperationsPanel />
        </div>
      </div>
    </DemoProvider>
  );
}
