import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { message } from 'antd';
import { CryptoToolkit, ERC20_ABI, type Hex } from '@ocash/sdk/browser';
import { getWalletClient } from 'wagmi/actions';
import { parseAmount } from '../../utils/format';
import { NATIVE_ADDRESS, type DepositEstimate } from '../constants';
import { DepositForm } from '../components';
import { formatFeeRows, formatNativeAmount, formatTokenAmount, useDebouncedValue } from '../utils';
import { useDemoStore } from '../state/demoStore';

export function DepositPanel() {
  const {
    sdk,
    walletOpened,
    currentToken,
    currentChain,
    config,
    publicClient,
    address,
    isConnected,
    walletChainId,
    selectedChainId,
    walletClient,
    wagmiConfig,
  } = useDemoStore();

  const [depositAmount, setDepositAmount] = useState('0.1');
  const [depositEstimate, setDepositEstimate] = useState<DepositEstimate | null>(null);
  const [depositEstimateLoading, setDepositEstimateLoading] = useState(false);
  const debouncedDepositAmount = useDebouncedValue(depositAmount, 400);
  const [expanded, setExpanded] = useState(false);
  const [depositStatus, setDepositStatus] = useState<'idle' | 'submitting' | 'waiting'>('idle');
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

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

  const waitForCommitment = useCallback(
    async (input: { commitment: Hex; chainId: number; assetId: string; timeoutMs?: number; intervalMs?: number }) => {
      if (!sdk) return;
      const timeoutMs = input.timeoutMs ?? 120_000;
      const intervalMs = input.intervalMs ?? 2_000;
      const startedAt = Date.now();
      const commitmentLower = input.commitment.toLowerCase();

      while (Date.now() - startedAt < timeoutMs) {
        const result = await sdk.wallet.getUtxos({
          chainId: input.chainId,
          assetId: input.assetId,
          includeSpent: true,
          offset: 0,
          limit: 50,
          orderBy: 'mkIndex',
          order: 'desc',
        });
        if (result.rows.some((row) => row.commitment.toLowerCase() === commitmentLower)) {
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
      }
      throw new Error('Timed out waiting for commitment to be indexed');
    },
    [sdk],
  );

  const handleDepositMax = useCallback(async () => {
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
  }, [publicClient, address, currentToken]);

  const handleDeposit = useCallback(async () => {
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
    setDepositStatus('submitting');
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
      const recipient = sdk.keys.userPkToAddress(prepared.recordOpening.user_pk);
      console.log('Prepared deposit:', recipient, prepared);
      const commitment = CryptoToolkit.commitment(prepared.recordOpening, 'hex') as Hex;

      const submit = await sdk.ops.submitDeposit({
        prepared,
        walletClient: activeWalletClient as any,
        publicClient,
        autoApprove: true,
      });
      console.log('Deposit submit result:', submit);
      if (isMountedRef.current) {
        setDepositStatus('waiting');
      }
      await waitForCommitment({
        commitment,
        chainId: currentChain.chainId,
        assetId: currentToken.id,
      });
      message.success('Deposit successful.');
    } catch (error) {
      message.error(error instanceof Error ? error.message : String(error));
    } finally {
      if (isMountedRef.current) {
        setDepositStatus('idle');
      }
    }
  }, [
    sdk,
    currentChain,
    currentToken,
    address,
    walletChainId,
    selectedChainId,
    isConnected,
    walletClient,
    wagmiConfig,
    publicClient,
    depositAmount,
    config.accountNonce,
    config.seed,
    waitForCommitment,
  ]);

  const depositFeeRows = useMemo(
    () =>
      formatFeeRows([
        { label: 'protocolFee', value: depositEstimate ? formatTokenAmount(depositEstimate.protocolFee, currentToken) : '' },
        { label: 'depositRelayerFee', value: depositEstimate ? formatNativeAmount(depositEstimate.depositRelayerFee) : '' },
        { label: 'payAmount', value: depositEstimate ? formatTokenAmount(depositEstimate.payAmount, currentToken) : '' },
        { label: 'value', value: depositEstimate ? formatNativeAmount(depositEstimate.value) : '' },
        { label: 'approveNeeded', value: depositEstimate ? String(Boolean(depositEstimate.approveNeeded)) : '' },
      ]),
    [depositEstimate, currentToken]
  );

  const chainMismatch = Boolean(walletChainId && selectedChainId && walletChainId !== selectedChainId);
  const depositNotice = !walletOpened ? 'Initialize the SDK to open the wallet.' : chainMismatch ? `Switch wallet chain to ${selectedChainId}.` : '';
  const depositSubmitting = depositStatus !== 'idle';
  const depositSubmitLabel = depositStatus === 'waiting' ? 'Waiting for commitment...' : depositStatus === 'submitting' ? 'Depositing...' : 'Deposit';

  return (
    <section className="panel span-4 panel-collapsible">
      <button type="button" className="panel-toggle" aria-expanded={expanded} onClick={() => setExpanded((prev) => !prev)}>
        <h2>Deposit</h2>
      </button>
      {expanded ? (
        <DepositForm
          amount={depositAmount}
          onAmountChange={setDepositAmount}
          onMax={handleDepositMax}
          onSubmit={handleDeposit}
          disabled={!sdk || !walletOpened || !currentToken || depositSubmitting}
          submitting={depositSubmitting}
          submitLabel={depositSubmitLabel}
          feeRows={depositFeeRows}
          feeLoading={depositEstimateLoading}
          feeError=""
          notice={depositNotice}
        />
      ) : null}
    </section>
  );
}
