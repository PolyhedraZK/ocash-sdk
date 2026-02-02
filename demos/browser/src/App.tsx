import { useCallback, useEffect, useMemo, useState } from 'react';
import OcashSdk, { ERC20_ABI, IndexedDbStore } from '@ocash/sdk/browser';
import type { Hex, StorageAdapter, StoredOperation, TokenMetadata, UtxoRecord } from '@ocash/sdk';
import { getAddress, isAddress } from 'viem';
import type { Chain } from 'viem';
import { useAccount, useChainId, useConnect, useDisconnect, usePublicClient, useSwitchChain, useWalletClient, WagmiProvider } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { parseAmount } from './utils/format';
import './styles.css';
import { DepositForm, TransferForm, WithdrawForm } from './app/components';
import { DEFAULT_CONFIG, NATIVE_ADDRESS, type BalanceRow, type DemoConfig, type DepositEstimate, type LogEntry } from './app/constants';
import { buildWagmiConfig, formatFeeRows, formatNativeAmount, formatTokenAmount, useDebouncedValue } from './app/utils';

const queryClient = new QueryClient();


function AppShell() {
  const [config, setConfig] = useState<DemoConfig>(DEFAULT_CONFIG);
  const wagmiConfig = useMemo(() => buildWagmiConfig(config), [config]);

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <App config={config} setConfig={setConfig} />
      </QueryClientProvider>
    </WagmiProvider>
  );
}

function App({ config, setConfig }: { config: DemoConfig; setConfig: (next: DemoConfig) => void }) {
  const [configText, setConfigText] = useState(() => JSON.stringify(config, null, 2));
  const [configError, setConfigError] = useState<string | null>(null);
  const [sdk, setSdk] = useState<ReturnType<typeof OcashSdk.createSdk> | null>(null);
  const [sdkStatus, setSdkStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [coreProgress, setCoreProgress] = useState<number>(0);
  const [walletOpened, setWalletOpened] = useState(false);
  const [viewingAddress, setViewingAddress] = useState<Hex | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [selectedChainId, setSelectedChainId] = useState<number | null>(config.chains?.[0]?.chainId ?? null);
  const [selectedTokenId, setSelectedTokenId] = useState<string | null>(config.chains?.[0]?.tokens?.[0]?.id ?? null);
  const [balances, setBalances] = useState<BalanceRow[]>([]);
  const [utxos, setUtxos] = useState<UtxoRecord[]>([]);
  const [utxoFilter, setUtxoFilter] = useState<'all' | 'unspent' | 'spent'>('unspent');
  const [operations, setOperations] = useState<StoredOperation[]>([]);
  const [actionMessage, setActionMessage] = useState<string>('');
  const [actionError, setActionError] = useState<string>('');
  const [depositAmount, setDepositAmount] = useState('0.1');
  const [transferAmount, setTransferAmount] = useState('0.1');
  const [transferTo, setTransferTo] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('0.1');
  const [withdrawRecipient, setWithdrawRecipient] = useState('');
  const [depositEstimate, setDepositEstimate] = useState<DepositEstimate | null>(null);
  const [depositEstimateError, setDepositEstimateError] = useState('');
  const [depositEstimateLoading, setDepositEstimateLoading] = useState(false);
  const [transferEstimate, setTransferEstimate] = useState<PlannerEstimateTransferResult | null>(null);
  const [transferEstimateError, setTransferEstimateError] = useState('');
  const [transferEstimateLoading, setTransferEstimateLoading] = useState(false);
  const [withdrawEstimate, setWithdrawEstimate] = useState<PlannerEstimateWithdrawResult | null>(null);
  const [withdrawEstimateError, setWithdrawEstimateError] = useState('');
  const [withdrawEstimateLoading, setWithdrawEstimateLoading] = useState(false);

  const { address, isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();
  const walletChainId = useChainId();
  const { data: walletClient } = useWalletClient({ chainId: selectedChainId ?? undefined });
  const publicClient = usePublicClient({ chainId: selectedChainId ?? undefined });

  const addLog = useCallback((entry: LogEntry) => {
    setLogs((prev) => [entry, ...prev].slice(0, 120));
  }, []);

  useEffect(() => {
    setConfigText(JSON.stringify(config, null, 2));
  }, [config]);

  useEffect(() => {
    const firstChain = config.chains?.[0]?.chainId ?? null;
    setSelectedChainId((prev) => (prev && config.chains.some((chain) => chain.chainId === prev) ? prev : firstChain));
  }, [config]);

  useEffect(() => {
    const chain = config.chains.find((item) => item.chainId === selectedChainId) ?? config.chains?.[0];
    const firstToken = chain?.tokens?.[0]?.id ?? null;
    setSelectedTokenId((prev) => (prev && chain?.tokens?.some((token) => token.id === prev) ? prev : firstToken));
  }, [config, selectedChainId]);

  useEffect(() => {
    const storage = new IndexedDbStore({ dbName: 'ocash_sdk_browser_demo', storeName: 'sdk_browser_demo' });
    const nextSdk = OcashSdk.createSdk({
      chains: config.chains,
      assetsOverride: config.assetsOverride,
      runtime: 'browser',
      storage,
      onEvent: (event) => {
        if (event.type === 'core:progress') {
          const pct = Math.min(100, Math.max(0, event.payload.loaded));
          setCoreProgress(pct);
          return;
        }
        if (event.type === 'error') {
          addLog({
            time: new Date().toLocaleTimeString(),
            label: event.type,
            message: `${event.payload.code}: ${event.payload.message}`,
            level: 'error',
          });
          return;
        }
        if (event.type === 'sync:progress') {
          addLog({
            time: new Date().toLocaleTimeString(),
            label: `sync:${event.payload.chainId}`,
            message: `${event.payload.resource} ${event.payload.downloaded}/${event.payload.total ?? '?'}`,
            level: 'info',
          });
        }
      },
    });

    setSdk(nextSdk);
    setSdkStatus('idle');
    setCoreProgress(0);
    setWalletOpened(false);
    setViewingAddress(null);
    setBalances([]);
    setUtxos([]);
    setOperations([]);
    setActionMessage('');
    setActionError('');

    return () => {
      storage.close?.();
    };
  }, [config, addLog]);

  const currentChain = config.chains.find((chain) => chain.chainId === selectedChainId) ?? config.chains?.[0];
  const currentTokens = currentChain?.tokens ?? [];
  const currentToken = currentTokens.find((token) => token.id === selectedTokenId) ?? currentTokens?.[0];
  const tokenInfoById = useMemo(() => {
    const map = new Map<string, TokenMetadata>();
    for (const token of currentTokens) map.set(token.id, token);
    return map;
  }, [currentTokens]);
  const debouncedDepositAmount = useDebouncedValue(depositAmount, 400);
  const debouncedTransferAmount = useDebouncedValue(transferAmount, 400);
  const debouncedWithdrawAmount = useDebouncedValue(withdrawAmount, 400);

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
  const chainMismatch = Boolean(walletChainId && selectedChainId && walletChainId !== selectedChainId);

  useEffect(() => {
    let active = true;
    setDepositEstimate(null);
    setDepositEstimateError('');
    setDepositEstimateLoading(false);
    if (!sdk || !currentChain || !currentToken || !publicClient || !address) return;
    const trimmed = debouncedDepositAmount.trim();
    if (!trimmed) return;
    let amount: bigint;
    try {
      amount = parseAmount(trimmed, currentToken.decimals);
    } catch (error) {
      setDepositEstimateError(error instanceof Error ? error.message : String(error));
      return;
    }
    setDepositEstimateLoading(true);
    const nonce = config.accountNonce != null ? String(config.accountNonce) : undefined;
    const pub = sdk.keys.getPublicKeyBySeed(config.seed, nonce);
    sdk.ops
      .prepareDeposit({
        chainId: currentChain.chainId,
        assetId: currentToken.id,
        amount,
        ownerPublicKey: pub,
        account: address,
        publicClient,
      })
      .then((prepared) => {
        if (!active) return;
        setDepositEstimate(prepared);
      })
      .catch((error) => {
        if (!active) return;
        setDepositEstimateError(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        if (!active) return;
        setDepositEstimateLoading(false);
      });
    return () => {
      active = false;
    };
  }, [sdk, currentChain, currentToken, publicClient, address, debouncedDepositAmount, config.accountNonce, config.seed]);

  useEffect(() => {
    let active = true;
    setTransferEstimate(null);
    setTransferEstimateError('');
    setTransferEstimateLoading(false);
    if (!sdk || !currentChain || !currentToken || !walletOpened) return;
    const trimmed = debouncedTransferAmount.trim();
    if (!trimmed) return;
    let amount: bigint;
    try {
      amount = parseAmount(trimmed, currentToken.decimals);
    } catch (error) {
      setTransferEstimateError(error instanceof Error ? error.message : String(error));
      return;
    }
    setTransferEstimateLoading(true);
    sdk.planner
      .estimate({ chainId: currentChain.chainId, assetId: currentToken.id, action: 'transfer', amount })
      .then((estimate) => {
        if (!active || estimate.action !== 'transfer') return;
        setTransferEstimate(estimate as PlannerEstimateTransferResult);
      })
      .catch((error) => {
        if (!active) return;
        setTransferEstimateError(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        if (!active) return;
        setTransferEstimateLoading(false);
      });
    return () => {
      active = false;
    };
  }, [sdk, currentChain, currentToken, walletOpened, debouncedTransferAmount]);

  useEffect(() => {
    let active = true;
    setWithdrawEstimate(null);
    setWithdrawEstimateError('');
    setWithdrawEstimateLoading(false);
    if (!sdk || !currentChain || !currentToken || !walletOpened) return;
    const trimmed = debouncedWithdrawAmount.trim();
    if (!trimmed) return;
    let amount: bigint;
    try {
      amount = parseAmount(trimmed, currentToken.decimals);
    } catch (error) {
      setWithdrawEstimateError(error instanceof Error ? error.message : String(error));
      return;
    }
    setWithdrawEstimateLoading(true);
    sdk.planner
      .estimate({ chainId: currentChain.chainId, assetId: currentToken.id, action: 'withdraw', amount })
      .then((estimate) => {
        if (!active || estimate.action !== 'withdraw') return;
        setWithdrawEstimate(estimate as PlannerEstimateWithdrawResult);
      })
      .catch((error) => {
        if (!active) return;
        setWithdrawEstimateError(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        if (!active) return;
        setWithdrawEstimateLoading(false);
      });
    return () => {
      active = false;
    };
  }, [sdk, currentChain, currentToken, walletOpened, debouncedWithdrawAmount]);

  const handleDepositMax = async () => {
    if (!publicClient || !address || !currentToken) return;
    try {
      const isNative = currentToken.wrappedErc20.toLowerCase() === NATIVE_ADDRESS.toLowerCase();
      const raw = isNative
        ? await publicClient.getBalance({ address })
        : ((await publicClient.readContract({
            address: currentToken.wrappedErc20,
            abi: ERC20_ABI as any,
            functionName: 'balanceOf',
            args: [address],
          })) as bigint);
      setDepositAmount(formatTokenAmount(raw, currentToken));
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    }
  };

  const handleTransferMax = () => {
    if (!transferEstimate || !currentToken) return;
    setTransferAmount(formatTokenAmount(transferEstimate.maxSummary.outputAmount, currentToken));
  };

  const handleWithdrawMax = () => {
    if (!withdrawEstimate || !currentToken) return;
    setWithdrawAmount(formatTokenAmount(withdrawEstimate.maxSummary.outputAmount, currentToken));
  };

  const handleApplyConfig = () => {
    try {
      const parsed = JSON.parse(configText) as DemoConfig;
      if (!parsed.seed || !parsed.chains?.length) {
        throw new Error('config must include seed and chains');
      }
      setConfig(parsed);
      setConfigError(null);
    } catch (error) {
      setConfigError(error instanceof Error ? error.message : String(error));
    }
  };

  const initSdk = async () => {
    if (!sdk) return;
    setSdkStatus('loading');
    setActionError('');
    try {
      await sdk.core.ready((value) => setCoreProgress(Math.round(value * 100)));
      await sdk.wallet.open({ seed: config.seed, accountNonce: config.accountNonce });
      setSdkStatus('ready');
      setWalletOpened(true);
      setViewingAddress(viewingAddressFromSeed ?? null);
      addLog({ time: new Date().toLocaleTimeString(), label: 'core', message: 'SDK ready', level: 'info' });
    } catch (error) {
      setSdkStatus('error');
      setActionError(error instanceof Error ? error.message : String(error));
    }
  };

  const closeWallet = async () => {
    if (!sdk) return;
    try {
      await sdk.wallet.close();
      setWalletOpened(false);
      addLog({ time: new Date().toLocaleTimeString(), label: 'wallet', message: 'Wallet closed', level: 'info' });
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    }
  };

  const syncOnce = async () => {
    if (!sdk || !currentChain) return;
    setActionError('');
    setActionMessage('Syncing…');
    try {
      await sdk.sync.syncOnce({ chainIds: [currentChain.chainId] });
      setActionMessage('Sync complete');
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
      setActionMessage('');
    }
  };

  const refreshBalances = async () => {
    if (!sdk || !currentChain || !walletOpened) return;
    const rows: BalanceRow[] = [];
    for (const token of currentTokens) {
      const value = await sdk.wallet.getBalance({ chainId: currentChain.chainId, assetId: token.id });
      rows.push({ token, value });
    }
    setBalances(rows);
  };

  const refreshOperations = () => {
    if (!sdk) return;
    const store = sdk.storage.getAdapter() as StorageAdapter;
    setOperations(store.listOperations());
  };

  const refreshUtxos = async () => {
    if (!sdk || !currentChain || !walletOpened) return;
    const includeSpent = utxoFilter !== 'unspent';
    const list = await sdk.wallet.getUtxos({
      chainId: currentChain.chainId,
      assetId: selectedTokenId ?? undefined,
      includeSpent,
    });
    const filtered = utxoFilter === 'all' ? list : list.filter((utxo) => (utxoFilter === 'spent' ? utxo.isSpent : !utxo.isSpent));
    setUtxos(filtered);
  };

  const handleDeposit = async () => {
    if (!sdk || !currentChain || !currentToken) return;
    if (!walletClient || !address) {
      setActionError('Wallet not connected');
      return;
    }
    if (!publicClient) {
      setActionError('Public client not available');
      return;
    }
    if (walletChainId && selectedChainId && walletChainId !== selectedChainId) {
      setActionError(`Wallet chain ${walletChainId} does not match target chain ${selectedChainId}`);
      setActionMessage('Switching wallet chain…');
      try {
        await switchChain({ chainId: selectedChainId });
      } catch (error) {
        setActionError(error instanceof Error ? error.message : String(error));
      }
      return;
    }
    setActionError('');
    setActionMessage('Preparing deposit…');
    try {
      await sdk.core.ready();
      const amount = parseAmount(depositAmount, currentToken.decimals);
      const nonce = config.accountNonce != null ? String(config.accountNonce) : undefined;
      const pub = sdk.keys.getPublicKeyBySeed(config.seed, nonce);

      const prepared = await sdk.ops.prepareDeposit({
        chainId: currentChain.chainId,
        assetId: currentToken.id,
        amount,
        ownerPublicKey: pub,
        account: address,
        publicClient,
      });

      setActionMessage('Submitting deposit…');
      const submit = await sdk.ops.submitDeposit({
        prepared,
        walletClient,
        publicClient,
        autoApprove: true,
      });
      setActionMessage(`Deposit tx: ${submit.txHash}`);
      refreshOperations();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
      setActionMessage('');
    }
  };

  const handleTransfer = async () => {
    if (!sdk || !currentChain || !currentToken) return;
    if (!publicClient) {
      setActionError('Public client not available');
      return;
    }
    if (!/^0x[0-9a-fA-F]{64}$/.test(transferTo)) {
      setActionError('Recipient must be a 32-byte viewing address');
      return;
    }
    setActionError('');
    setActionMessage('Syncing…');
    try {
      await sdk.core.ready();
      await sdk.wallet.open({ seed: config.seed, accountNonce: config.accountNonce });
      await sdk.sync.syncOnce({ chainIds: [currentChain.chainId] });

      const amount = parseAmount(transferAmount, currentToken.decimals);
      const nonce = config.accountNonce != null ? String(config.accountNonce) : undefined;
      const owner = sdk.keys.deriveKeyPair(config.seed, nonce);
      const prepared = await sdk.ops.prepareTransfer({
        chainId: currentChain.chainId,
        assetId: currentToken.id,
        amount,
        to: transferTo as Hex,
        ownerKeyPair: owner,
        publicClient,
        autoMerge: true,
      });

      if (prepared.kind === 'merge') {
        setActionMessage('Merge required: submit merge plan, sync, then retry transfer.');
        return;
      }

      setActionMessage('Submitting relayer request…');
      const submit = await sdk.ops.submitRelayerRequest<Hex>({ prepared, publicClient });
      await submit.TransactionReceipt;
      setActionMessage(`Transfer relayer tx: ${submit.result}`);
      refreshOperations();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
      setActionMessage('');
    }
  };

  const handleWithdraw = async () => {
    if (!sdk || !currentChain || !currentToken) return;
    if (!publicClient) {
      setActionError('Public client not available');
      return;
    }
    if (!isAddress(withdrawRecipient)) {
      setActionError('Recipient must be a valid EVM address');
      return;
    }
    setActionError('');
    setActionMessage('Syncing…');
    try {
      await sdk.core.ready();
      await sdk.wallet.open({ seed: config.seed, accountNonce: config.accountNonce });
      await sdk.sync.syncOnce({ chainIds: [currentChain.chainId] });

      const amount = parseAmount(withdrawAmount, currentToken.decimals);
      const nonce = config.accountNonce != null ? String(config.accountNonce) : undefined;
      const owner = sdk.keys.deriveKeyPair(config.seed, nonce);
      const prepared = await sdk.ops.prepareWithdraw({
        chainId: currentChain.chainId,
        assetId: currentToken.id,
        amount,
        recipient: getAddress(withdrawRecipient),
        ownerKeyPair: owner,
        publicClient,
      });

      setActionMessage('Submitting relayer request…');
      const submit = await sdk.ops.submitRelayerRequest<Hex>({ prepared, publicClient });
      await submit.TransactionReceipt;
      setActionMessage(`Withdraw relayer tx: ${submit.result}`);
      refreshOperations();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
      setActionMessage('');
    }
  };

  const depositFeeRows = formatFeeRows([
    { label: 'protocolFee', value: depositEstimate ? formatTokenAmount(depositEstimate.protocolFee, currentToken) : '' },
    { label: 'depositRelayerFee', value: depositEstimate ? formatNativeAmount(depositEstimate.depositRelayerFee) : '' },
    { label: 'payAmount', value: depositEstimate ? formatTokenAmount(depositEstimate.payAmount, currentToken) : '' },
    { label: 'value', value: depositEstimate ? formatNativeAmount(depositEstimate.value) : '' },
    { label: 'approveNeeded', value: depositEstimate ? String(Boolean(depositEstimate.approveNeeded)) : '' },
  ]);

  const transferFeeRows = formatFeeRows([
    { label: 'relayerFee', value: transferEstimate ? formatTokenAmount(transferEstimate.relayerFee, currentToken) : '' },
    { label: 'required', value: transferEstimate ? formatTokenAmount(transferEstimate.required, currentToken) : '' },
    { label: 'mergeCount', value: transferEstimate ? String(transferEstimate.feeSummary.mergeCount) : '' },
    { label: 'feeCount', value: transferEstimate ? String(transferEstimate.feeSummary.feeCount) : '' },
    { label: 'inputCount', value: transferEstimate ? String(transferEstimate.feeSummary.inputCount) : '' },
    { label: 'relayerFeeTotal', value: transferEstimate ? formatTokenAmount(transferEstimate.feeSummary.relayerFeeTotal, currentToken) : '' },
    { label: 'protocolFeeTotal', value: transferEstimate ? formatTokenAmount(transferEstimate.feeSummary.protocolFeeTotal, currentToken) : '' },
    { label: 'cost', value: transferEstimate ? formatTokenAmount(transferEstimate.feeSummary.cost, currentToken) : '' },
    { label: 'maxOutput', value: transferEstimate ? formatTokenAmount(transferEstimate.maxSummary.outputAmount, currentToken) : '' },
  ]);

  const withdrawFeeRows = formatFeeRows([
    { label: 'relayerFee', value: withdrawEstimate ? formatTokenAmount(withdrawEstimate.relayerFee, currentToken) : '' },
    { label: 'protocolFee', value: withdrawEstimate ? formatTokenAmount(withdrawEstimate.protocolFee, currentToken) : '' },
    { label: 'burnAmount', value: withdrawEstimate ? formatTokenAmount(withdrawEstimate.burnAmount, currentToken) : '' },
    { label: 'mergeCount', value: withdrawEstimate ? String(withdrawEstimate.feeSummary.mergeCount) : '' },
    { label: 'feeCount', value: withdrawEstimate ? String(withdrawEstimate.feeSummary.feeCount) : '' },
    { label: 'inputCount', value: withdrawEstimate ? String(withdrawEstimate.feeSummary.inputCount) : '' },
    { label: 'relayerFeeTotal', value: withdrawEstimate ? formatTokenAmount(withdrawEstimate.feeSummary.relayerFeeTotal, currentToken) : '' },
    { label: 'protocolFeeTotal', value: withdrawEstimate ? formatTokenAmount(withdrawEstimate.feeSummary.protocolFeeTotal, currentToken) : '' },
    { label: 'cost', value: withdrawEstimate ? formatTokenAmount(withdrawEstimate.feeSummary.cost, currentToken) : '' },
    { label: 'maxOutput', value: withdrawEstimate ? formatTokenAmount(withdrawEstimate.maxSummary.outputAmount, currentToken) : '' },
  ]);

  const depositNotice = !walletOpened ? 'Initialize the SDK to open the wallet.' : chainMismatch ? `Switch wallet chain to ${selectedChainId}.` : '';
  const transferNotice = !walletOpened ? 'Initialize the SDK to open the wallet.' : '';
  const withdrawNotice = !walletOpened ? 'Initialize the SDK to open the wallet.' : '';

  const statusLabel = sdkStatus === 'ready' ? 'Ready' : sdkStatus === 'loading' ? 'Loading' : sdkStatus === 'error' ? 'Error' : 'Idle';

  return (
    <div className="app">
      <div className="header">
        <h1>OCash SDK Browser Demo</h1>
        <p>Browser SDK + wagmi/viem wallet flow for deposit, transfer, withdraw, and history.</p>
      </div>

      <div className="grid">
        <section className="panel span-7">
          <div className="row">
            <div>
              <h2>Config</h2>
              <div className="label">SDK + Chain Settings</div>
            </div>
            <span className="badge">{statusLabel}</span>
          </div>
          <textarea value={configText} onChange={(event) => setConfigText(event.target.value)} spellCheck={false} />
          {configError && <div className="notice">{configError}</div>}
          <div className="row">
            <button className="accent" onClick={handleApplyConfig}>
              Apply Config
            </button>
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
              <strong>OCash Receive (nonce {config.accountNonce ?? 0}):</strong> <span className="mono">{viewingAddress ?? viewingAddressFromSeed ?? 'N/A'}</span>
            </div>
          </div>
          {chainMismatch && (
            <div className="notice">
              Wallet chain {walletChainId} does not match target chain {selectedChainId}.
              {selectedChainId ? (
                <div className="row">
                  <button className="secondary" onClick={() => switchChain({ chainId: selectedChainId })}>
                    Switch Wallet Chain
                  </button>
                </div>
              ) : null}
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

        <section className="panel span-4">
          <h2>Deposit</h2>
          <DepositForm
            amount={depositAmount}
            onAmountChange={setDepositAmount}
            onMax={handleDepositMax}
            onSubmit={handleDeposit}
            disabled={!sdk || !walletOpened || !currentToken}
            feeRows={depositFeeRows}
            feeLoading={depositEstimateLoading}
            feeError={depositEstimateError}
            notice={depositNotice}
          />
        </section>

        <section className="panel span-4">
          <h2>Transfer</h2>
          <TransferForm
            amount={transferAmount}
            to={transferTo}
            onAmountChange={setTransferAmount}
            onToChange={setTransferTo}
            onMax={handleTransferMax}
            onSubmit={handleTransfer}
            disabled={!sdk || !walletOpened || !currentToken}
            feeRows={transferFeeRows}
            feeLoading={transferEstimateLoading}
            feeError={transferEstimateError}
            feeOk={transferEstimate?.ok}
            feeOkWithMerge={transferEstimate?.okWithMerge}
            notice={transferNotice}
          />
        </section>

        <section className="panel span-4">
          <h2>Withdraw</h2>
          <WithdrawForm
            amount={withdrawAmount}
            recipient={withdrawRecipient}
            onAmountChange={setWithdrawAmount}
            onRecipientChange={setWithdrawRecipient}
            onMax={handleWithdrawMax}
            onSubmit={handleWithdraw}
            disabled={!sdk || !walletOpened || !currentToken}
            feeRows={withdrawFeeRows}
            feeLoading={withdrawEstimateLoading}
            feeError={withdrawEstimateError}
            feeOk={withdrawEstimate?.ok}
            feeOkWithMerge={withdrawEstimate?.okWithMerge}
            notice={withdrawNotice}
          />
        </section>

        <section className="panel span-6">
          <div className="row">
            <h2>Total Assets</h2>
            <button className="secondary" onClick={refreshBalances} disabled={!walletOpened || !sdk}>
              Refresh
            </button>
          </div>
          <div className="list">
            {balances.length === 0 && <div className="notice">No balance data loaded.</div>}
            {balances.map((row) => (
              <div key={row.token.id} className="list-item">
                <div className="row">
                  <strong>{row.token.symbol}</strong>
                  <span className="mono">{formatTokenAmount(row.value, row.token)}</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="panel span-6">
          <div className="row">
            <h2>UTXOs</h2>
            <select value={utxoFilter} onChange={(event) => setUtxoFilter(event.target.value as typeof utxoFilter)}>
              <option value="unspent">Unspent</option>
              <option value="spent">Spent</option>
              <option value="all">All</option>
            </select>
            <button className="secondary" onClick={refreshUtxos} disabled={!walletOpened || !sdk}>
              Refresh
            </button>
          </div>
          <div className="list">
            {utxos.length === 0 && <div className="notice">No UTXOs found for current filter.</div>}
            {utxos.map((utxo) => (
              <div key={`${utxo.chainId}-${utxo.commitment}`} className="list-item">
                <div className="row">
                  <strong>{tokenInfoById.get(utxo.assetId)?.symbol ?? utxo.assetId}</strong>
                  <span className="mono">{formatTokenAmount(utxo.amount, tokenInfoById.get(utxo.assetId))}</span>
                </div>
                <div className="mono">commitment: {utxo.commitment}</div>
                <div className="mono">nullifier: {utxo.nullifier}</div>
                <div className="status">
                  spent: {String(utxo.isSpent)} | frozen: {String(utxo.isFrozen)}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="panel span-6">
          <h2>Operations</h2>
          <div className="list">
            {operations.length === 0 && <div className="notice">No operations yet.</div>}
            {operations.map((op) => (
              <div key={op.id} className="list-item">
                <div className="row">
                  <strong>{op.type}</strong>
                  <span className="badge">{op.status}</span>
                </div>
                <div className="mono">token: {op.tokenId}</div>
                <div className="mono">created: {new Date(op.createdAt).toLocaleString()}</div>
                {op.txHash && <div className="mono">txHash: {op.txHash}</div>}
                {op.relayerTxHash && <div className="mono">relayerTx: {op.relayerTxHash}</div>}
              </div>
            ))}
          </div>
        </section>

        <section className="panel span-6">
          <h2>Activity</h2>
          {actionMessage && <div className="notice">{actionMessage}</div>}
          {actionError && <div className="notice">{actionError}</div>}
          <div className="list">
            {logs.length === 0 && <div className="notice">No logs yet.</div>}
            {logs.map((entry, idx) => (
              <div key={`${entry.time}-${idx}`} className="list-item">
                <div className="row">
                  <strong>{entry.label}</strong>
                  <span className="mono">{entry.time}</span>
                </div>
                <div className="mono">{entry.message}</div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

export default AppShell;
