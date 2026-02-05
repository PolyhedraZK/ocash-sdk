import { useCallback, useEffect, useMemo, useState } from 'react';
import OcashSdk, { ERC20_ABI, IndexedDbStore } from '@ocash/sdk/browser';
import type { Hex, PlannerEstimateTransferResult, PlannerEstimateWithdrawResult, StorageAdapter, StoredOperation, TokenMetadata, UtxoRecord } from '@ocash/sdk';
import { defineChain, getAddress, isAddress } from 'viem';
import { createConfig, http } from 'wagmi';
import { useAccount, useChainId, useConfig, useConnect, useDisconnect, usePublicClient, useWalletClient } from 'wagmi';
import { getWalletClient } from 'wagmi/actions';
import { injected, metaMask } from 'wagmi/connectors';
import { message } from 'antd';
import { parseAmount } from '../../utils/format';
import { DEFAULT_CONFIG, NATIVE_ADDRESS, type BalanceRow, type DemoConfig, type DepositEstimate, type LogEntry } from '../constants';
import { formatFeeRows, formatNativeAmount, formatTokenAmount, useDebouncedValue } from '../utils';
import { sepolia } from 'viem/chains';

export type DemoController = ReturnType<typeof useDemoController>;

export function useDemoController({ config }: { config: DemoConfig }) {
  const configText = useMemo(() => JSON.stringify(config, null, 2), [config]);
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
  const [depositAmount, setDepositAmount] = useState('0.1');
  const [transferAmount, setTransferAmount] = useState('0.1');
  const [transferTo, setTransferTo] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('0.1');
  const [withdrawRecipient, setWithdrawRecipient] = useState('');
  const [depositEstimate, setDepositEstimate] = useState<DepositEstimate | null>(null);
  const [depositEstimateLoading, setDepositEstimateLoading] = useState(false);
  const [transferEstimate, setTransferEstimate] = useState<PlannerEstimateTransferResult | null>(null);
  const [transferEstimateLoading, setTransferEstimateLoading] = useState(false);
  const [withdrawEstimate, setWithdrawEstimate] = useState<PlannerEstimateWithdrawResult | null>(null);
  const [withdrawEstimateLoading, setWithdrawEstimateLoading] = useState(false);

  const { address, isConnected, chainId } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();
  const wagmiConfig = useConfig();
  const walletChainId = useChainId();
  const wc = useWalletClient();
  const walletClient = wc.data;
  const publicClient = usePublicClient({ chainId: walletChainId });

  const addLog = useCallback((entry: LogEntry) => {
    setLogs((prev) => [entry, ...prev].slice(0, 120));
  }, []);

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
    setDepositEstimateLoading(false);
    if (!sdk || !currentChain || !currentToken || !publicClient || !address) return;
    const trimmed = debouncedDepositAmount.trim();
    if (!trimmed) return;
    let amount: bigint;
    try {
      amount = parseAmount(trimmed, currentToken.decimals);
    } catch (error) {
      message.error(error instanceof Error ? error.message : String(error));
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
        message.error(error instanceof Error ? error.message : String(error));
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
    setTransferEstimateLoading(false);
    if (!sdk || !currentChain || !currentToken || !walletOpened) return;
    const trimmed = debouncedTransferAmount.trim();
    if (!trimmed) return;
    let amount: bigint;
    try {
      amount = parseAmount(trimmed, currentToken.decimals);
    } catch (error) {
      message.error(error instanceof Error ? error.message : String(error));
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
        message.error(error instanceof Error ? error.message : String(error));
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
    setWithdrawEstimateLoading(false);
    if (!sdk || !currentChain || !currentToken || !walletOpened) return;
    const trimmed = debouncedWithdrawAmount.trim();
    if (!trimmed) return;
    let amount: bigint;
    try {
      amount = parseAmount(trimmed, currentToken.decimals);
    } catch (error) {
      message.error(error instanceof Error ? error.message : String(error));
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
        message.error(error instanceof Error ? error.message : String(error));
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
      message.error(error instanceof Error ? error.message : String(error));
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

  const initSdk = async () => {
    if (!sdk) return;
    setSdkStatus('loading');
    try {
      await sdk.core.ready((value) => setCoreProgress(Math.round(value * 100)));
      await sdk.wallet.open({ seed: config.seed, accountNonce: config.accountNonce });
      setSdkStatus('ready');
      setWalletOpened(true);
      setViewingAddress(viewingAddressFromSeed ?? null);
      addLog({ time: new Date().toLocaleTimeString(), label: 'core', message: 'SDK ready', level: 'info' });
    } catch (error) {
      setSdkStatus('error');
      message.error(error instanceof Error ? error.message : String(error));
    }
  };

  const closeWallet = async () => {
    if (!sdk) return;
    try {
      await sdk.wallet.close();
      setWalletOpened(false);
      addLog({ time: new Date().toLocaleTimeString(), label: 'wallet', message: 'Wallet closed', level: 'info' });
    } catch (error) {
      message.error(error instanceof Error ? error.message : String(error));
    }
  };

  const syncOnce = async () => {
    if (!sdk || !currentChain) return;
    setActionMessage('Syncing…');
    try {
      await sdk.sync.syncOnce({ chainIds: [currentChain.chainId] });
      setActionMessage('Sync complete');
    } catch (error) {
      message.error(error instanceof Error ? error.message : String(error));
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
    if (address && walletChainId && selectedChainId && walletChainId !== selectedChainId) {
      message.error(`Wallet chain ${walletChainId} does not match target chain ${selectedChainId}. Please switch in your wallet.`);
      return;
    }
    if (!isConnected || !address) {
      message.error('Wallet not connected');
      return;
    }
    const activeWalletClient = walletClient ?? (await getWalletClient(wagmiConfig, { chainId: selectedChainId ?? undefined }).catch(() => undefined));
    if (!activeWalletClient) {
      message.error('Wallet client not available');
      return;
    }
    if (!publicClient) {
      message.error('Public client not available');
      return;
    }
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
        walletClient: activeWalletClient,
        publicClient,
        autoApprove: true,
      });
      setActionMessage(`Deposit tx: ${submit.txHash}`);
      refreshOperations();
    } catch (error) {
      message.error(error instanceof Error ? error.message : String(error));
      setActionMessage('');
    }
  };

  const handleTransfer = async () => {
    if (!sdk || !currentChain || !currentToken) return;
    if (!publicClient) {
      message.error('Public client not available');
      return;
    }
    if (!/^0x[0-9a-fA-F]{64}$/.test(transferTo)) {
      message.error('Recipient must be a 32-byte viewing address');
      return;
    }
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
      message.error(error instanceof Error ? error.message : String(error));
      setActionMessage('');
    }
  };

  const handleWithdraw = async () => {
    if (!sdk || !currentChain || !currentToken) return;
    if (!publicClient) {
      message.error('Public client not available');
      return;
    }
    if (!isAddress(withdrawRecipient)) {
      message.error('Recipient must be a valid EVM address');
      return;
    }
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
      message.error(error instanceof Error ? error.message : String(error));
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

  return {
    config,
    configText,
    sdk,
    sdkStatus,
    coreProgress,
    walletOpened,
    viewingAddress,
    viewingAddressFromSeed,
    logs,
    selectedChainId,
    setSelectedChainId,
    selectedTokenId,
    setSelectedTokenId,
    balances,
    utxos,
    utxoFilter,
    setUtxoFilter,
    operations,
    actionMessage,
    depositAmount,
    setDepositAmount,
    transferAmount,
    setTransferAmount,
    transferTo,
    setTransferTo,
    withdrawAmount,
    setWithdrawAmount,
    withdrawRecipient,
    setWithdrawRecipient,
    depositEstimateLoading,
    transferEstimateLoading,
    withdrawEstimateLoading,
    transferEstimate,
    withdrawEstimate,
    currentChain,
    currentTokens,
    currentToken,
    tokenInfoById,
    chainMismatch,
    walletChainId,
    address,
    isConnected,
    connectors,
    connect,
    disconnect,
    statusLabel,
    initSdk,
    closeWallet,
    syncOnce,
    refreshBalances,
    refreshOperations,
    refreshUtxos,
    handleDepositMax,
    handleTransferMax,
    handleWithdrawMax,
    handleDeposit,
    handleTransfer,
    handleWithdraw,
    depositFeeRows,
    transferFeeRows,
    withdrawFeeRows,
    depositNotice,
    transferNotice,
    withdrawNotice,
  } as const;
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
