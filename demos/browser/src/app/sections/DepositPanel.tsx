import { useCallback, useEffect, useMemo, useState } from 'react';
import { message } from 'antd';
import { ERC20_ABI } from '@ocash/sdk/browser';
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

      const submit = await sdk.ops.submitDeposit({
        prepared,
        walletClient: activeWalletClient,
        publicClient,
        autoApprove: true,
      });
      console.log('Deposit submit result:', submit);
    } catch (error) {
      message.error(error instanceof Error ? error.message : String(error));
    }
  }, [sdk, currentChain, currentToken, address, walletChainId, selectedChainId, isConnected, walletClient, wagmiConfig, publicClient, depositAmount, config.accountNonce, config.seed]);

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
          disabled={!sdk || !walletOpened || !currentToken}
          feeRows={depositFeeRows}
          feeLoading={depositEstimateLoading}
          feeError=""
          notice={depositNotice}
        />
      ) : null}
    </section>
  );
}
