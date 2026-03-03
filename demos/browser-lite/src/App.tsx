import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider } from 'wagmi';
import { DemoProvider, WAGMI_CONFIG } from './store';
import { WalletPanel } from './panels/WalletPanel';
import { BalancePanel } from './panels/BalancePanel';
import { DepositPanel } from './panels/DepositPanel';
import { TransferPanel } from './panels/TransferPanel';
import { WithdrawPanel } from './panels/WithdrawPanel';
import { EventLogPanel } from './panels/EventLogPanel';
import './styles.css';

const queryClient = new QueryClient();

export default function App() {
  return (
    <WagmiProvider config={WAGMI_CONFIG}>
      <QueryClientProvider client={queryClient}>
        <DemoProvider>
          <div className="app">
            <h1>OCash SDK — Lite Demo</h1>
            <WalletPanel />
            <BalancePanel />
            <DepositPanel />
            <TransferPanel />
            <WithdrawPanel />
            <EventLogPanel />
          </div>
        </DemoProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
