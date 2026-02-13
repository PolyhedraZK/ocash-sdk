import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import OcashSdk, { IndexedDbStore } from '@ocash/sdk/browser';
import type { Hex, StorageAdapter, StoredOperation, TokenMetadata } from '@ocash/sdk';
import { defineChain } from 'viem';
import { createConfig, http, type UseWalletClientReturnType } from 'wagmi';
import { useAccount, useChainId, useConfig, useConnect, useDisconnect, usePublicClient, useWalletClient } from 'wagmi';
import { injected, metaMask } from 'wagmi/connectors';
import { message } from 'antd';
import { DEFAULT_CONFIG, type DemoConfig } from '../constants';
import { sepolia } from 'viem/chains';

export type DemoStore = {
  config: DemoConfig;
  configText: string;
  sdk: ReturnType<typeof OcashSdk.createSdk> | null;
  sdkStatus: 'idle' | 'loading' | 'ready' | 'error';
  setSdkStatus: (value: 'idle' | 'loading' | 'ready' | 'error') => void;
  walletOpened: boolean;
  setWalletOpened: (value: boolean) => void;
  viewingAddress: Hex | null;
  setViewingAddress: (value: Hex | null) => void;
  viewingAddressFromSeed: Hex | null;
  selectedChainId: number | null;
  setSelectedChainId: (value: number | null) => void;
  selectedTokenId: string | null;
  setSelectedTokenId: (value: string | null) => void;
  currentChain: DemoConfig['chains'][number] | undefined;
  currentTokens: TokenMetadata[];
  currentToken: TokenMetadata | undefined;
  tokenInfoById: Map<string, TokenMetadata>;
  operations: StoredOperation[];
  setOperations: (value: StoredOperation[]) => void;
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

export function DemoProvider({ config, children }: { config: DemoConfig; children: ReactNode }) {
  const configText = useMemo(() => JSON.stringify(config, null, 2), [config]);
  const [sdk, setSdk] = useState<ReturnType<typeof OcashSdk.createSdk> | null>(null);
  const [sdkStatus, setSdkStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [walletOpened, setWalletOpened] = useState(false);
  const [viewingAddress, setViewingAddress] = useState<Hex | null>(null);
  const [selectedChainId, setSelectedChainId] = useState<number | null>(config.chains?.[0]?.chainId ?? null);
  const [selectedTokenId, setSelectedTokenId] = useState<string | null>(config.chains?.[0]?.tokens?.[0]?.id ?? null);
  const [operations, setOperations] = useState<StoredOperation[]>([]);

  const { address, isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();
  const wagmiConfig = useConfig();
  const walletChainId = useChainId();
  const wc = useWalletClient();
  const walletClient = wc.data;
  const publicClient = usePublicClient({ chainId: walletChainId });

  useEffect(() => {
    const firstChain = config.chains?.[0]?.chainId ?? null;
    setSelectedChainId((prev) => (prev && config.chains.some((chain) => chain.chainId === prev) ? prev : firstChain));
  }, [config]);

  useEffect(() => {
    const chain = config.chains.find((item) => item.chainId === selectedChainId) ?? config.chains?.[0];
    const firstToken = chain?.tokens?.[0]?.id ?? null;
    setSelectedTokenId((prev) => (prev && chain?.tokens?.some((token) => token.id === prev) ? prev : firstToken));
  }, [config, selectedChainId]);

  const currentChain = config.chains.find((chain) => chain.chainId === selectedChainId) ?? config.chains?.[0];
  const currentTokens = currentChain?.tokens ?? [];
  const currentToken = currentTokens.find((token) => token.id === selectedTokenId) ?? currentTokens?.[0];

  useEffect(() => {
    const storage = new IndexedDbStore({ dbName: 'ocash_sdk_browser_demo', storeName: 'sdk_browser_demo' });
    const nextSdk = OcashSdk.createSdk({
      chains: config.chains,
      assetsOverride: config.assetsOverride,
      runtime: 'browser',
      storage,
      onEvent: (event) => {
        if (event.type === 'operations:update') {
          const store = nextSdk.storage.getAdapter() as StorageAdapter;
          setOperations(store.listOperations());
          return;
        }
        if (event.type === 'error') {
          message.error(`${event.payload.code}: ${event.payload.message}`);
        }
      },
    });

    setSdk(nextSdk);
    setSdkStatus('idle');
    setWalletOpened(false);
    setViewingAddress(null);
    setOperations([]);

    return () => {
      storage.close?.();
    };
  }, [config]);

  const tokenInfoById = useMemo(() => {
    const map = new Map<string, TokenMetadata>();
    for (const token of currentTokens) map.set(token.id, token);
    return map;
  }, [currentTokens]);

  const viewingAddressFromSeed = useMemo(() => {
    if (!sdk) return null;
    try {
      const nonce = config.accountNonce != null ? String(config.accountNonce) : undefined;
      const pub = sdk.keys.getPublicKeyBySeed(config.seed, nonce);
      return sdk.keys.userPkToAddress(pub.user_pk);
    } catch {
      return null;
    }
  }, [sdk, config]);

  const value: DemoStore = {
    config,
    configText,
    sdk,
    sdkStatus,
    setSdkStatus,
    walletOpened,
    setWalletOpened,
    viewingAddress,
    setViewingAddress,
    viewingAddressFromSeed,
    selectedChainId,
    setSelectedChainId,
    selectedTokenId,
    setSelectedTokenId,
    currentChain,
    currentTokens,
    currentToken,
    tokenInfoById,
    operations,
    setOperations,
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

export const DEMO_CONFIG = DEFAULT_CONFIG;

const sepoliaChain = defineChain({
  ...sepolia,
  rpcUrls: {
    default: {
      http: [DEFAULT_CONFIG.chains[0].rpcUrl!],
    },
    public: {
      http: [DEFAULT_CONFIG.chains[0].rpcUrl!],
    },
  },
});

export const DEMO_WAGMI_CONFIG = createConfig({
  chains: [sepoliaChain],
  connectors: [injected(), metaMask()],
  transports: { [sepoliaChain.id]: http() },
});
