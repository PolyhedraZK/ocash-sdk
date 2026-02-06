import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider } from 'wagmi';
import { DemoApp } from './app/DemoApp';
import { DEMO_CONFIG, DEMO_WAGMI_CONFIG } from './app/state/demoStore';
import './styles.css';

const queryClient = new QueryClient();

function AppShell() {
  return (
    <WagmiProvider config={DEMO_WAGMI_CONFIG}>
      <QueryClientProvider client={queryClient}>
        <DemoApp config={DEMO_CONFIG} />
      </QueryClientProvider>
    </WagmiProvider>
  );
}

export default AppShell;
