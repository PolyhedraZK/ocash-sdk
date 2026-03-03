import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import OcashSdk, { IndexedDbStore } from '@ocash/sdk/browser';
import type { Hex, TokenMetadata } from '@ocash/sdk';
import { defineChain } from 'viem';
import { createConfig, http, type UseWalletClientReturnType } from 'wagmi';
import { useAccount, useChainId, useConfig, useConnect, useDisconnect, usePublicClient, useWalletClient } from 'wagmi';
import { injected, metaMask } from 'wagmi/connectors';
import { sepolia } from 'viem/chains';
import { CHAIN, ASSETS_OVERRIDE, DEFAULT_SEED, DEFAULT_ACCOUNT_NONCE } from './config';

export type LogEntry = {
  time: string;
  label: string;
  message: string;
  level: 'info' | 'warn' | 'error';
};

export type DemoStore = {
  sdk: ReturnType<typeof OcashSdk.createSdk> | null;
  sdkStatus: 'idle' | 'loading' | 'ready' | 'error';
  setSdkStatus: (v: 'idle' | 'loading' | 'ready' | 'error') => void;
  walletOpened: boolean;
  setWalletOpened: (v: boolean) => void;
  viewingAddress: Hex | null;
  setViewingAddress: (v: Hex | null) => void;
  seed: string;
  accountNonce: number;
  chainId: number;
  token: TokenMetadata | undefined;
  log: LogEntry[];
  appendLog: (label: string, message: string, level?: LogEntry['level']) => void;
  clearLog: () => void;
  address?: Hex;
  isConnected: boolean;
  connectors: ReturnType<typeof useConnect>['connectors'];
  connect: ReturnType<typeof useConnect>['connect'];
  disconnect: ReturnType<typeof useDisconnect>['disconnect'];
  wagmiConfig: ReturnType<typeof useConfig>;
  walletChainId: number | undefined;
  walletClient: UseWalletClientReturnType['data'];
  publicClient: ReturnType<typeof usePublicClient>;
};

const DemoStoreContext = createContext<DemoStore | null>(null);

export function DemoProvider({ children }: { children: ReactNode }) {
  const [sdk, setSdk] = useState<ReturnType<typeof OcashSdk.createSdk> | null>(null);
  const [sdkStatus, setSdkStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [walletOpened, setWalletOpened] = useState(false);
  const [viewingAddress, setViewingAddress] = useState<Hex | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);

  const { address, isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();
  const wagmiConfig = useConfig();
  const walletChainId = useChainId();
  const wc = useWalletClient();
  const walletClient = wc.data;
  const publicClient = usePublicClient({ chainId: walletChainId });

  const chainId = CHAIN.chainId;
  const token = CHAIN.tokens?.[0];

  const appendLog = useMemo(
    () => (label: string, message: string, level: LogEntry['level'] = 'info') => {
      const time = new Date().toLocaleTimeString();
      setLog((prev) => [{ time, label, message, level }, ...prev].slice(0, 200));
    },
    [],
  );

  const clearLog = useMemo(() => () => setLog([]), []);

  useEffect(() => {
    const storage = new IndexedDbStore({ dbName: 'ocash_lite_demo', storeName: 'lite' });
    const nextSdk = OcashSdk.createSdk({
      chains: [CHAIN],
      assetsOverride: ASSETS_OVERRIDE,
      runtime: 'browser',
      storage,
      onEvent: (event) => {
        if (event.type === 'error') {
          appendLog(event.type, `${event.payload.code}: ${event.payload.message}`, 'error');
          return;
        }
        const msg = 'payload' in event ? JSON.stringify(event.payload) : '';
        appendLog(event.type, msg);
      },
    });

    setSdk(nextSdk);
    setSdkStatus('idle');
    setWalletOpened(false);
    setViewingAddress(null);

    return () => {
      storage.close?.();
    };
  }, [appendLog]);

  const value: DemoStore = {
    sdk,
    sdkStatus,
    setSdkStatus,
    walletOpened,
    setWalletOpened,
    viewingAddress,
    setViewingAddress,
    seed: DEFAULT_SEED,
    accountNonce: DEFAULT_ACCOUNT_NONCE,
    chainId,
    token,
    log,
    appendLog,
    clearLog,
    address,
    isConnected,
    connectors,
    connect,
    disconnect,
    wagmiConfig,
    walletChainId,
    walletClient,
    publicClient,
  };

  return <DemoStoreContext.Provider value={value}>{children}</DemoStoreContext.Provider>;
}

export function useDemoStore() {
  const ctx = useContext(DemoStoreContext);
  if (!ctx) throw new Error('useDemoStore must be used within DemoProvider');
  return ctx;
}

const sepoliaChain = defineChain({
  ...sepolia,
  rpcUrls: {
    default: { http: [CHAIN.rpcUrl!] },
    public: { http: [CHAIN.rpcUrl!] },
  },
});

export const WAGMI_CONFIG = createConfig({
  chains: [sepoliaChain],
  connectors: [injected(), metaMask()],
  transports: { [sepoliaChain.id]: http() },
});
