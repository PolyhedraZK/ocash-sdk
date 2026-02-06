import { useCallback, useEffect, useMemo, useState } from 'react';
import { message } from 'antd';
import type { Hex, PlannerEstimateTransferResult } from '@ocash/sdk';
import { parseAmount } from '../../utils/format';
import { TransferForm } from '../components';
import { formatFeeRows, formatTokenAmount, useDebouncedValue } from '../utils';
import { useDemoStore } from '../state/demoStore';

export function TransferPanel() {
  const { sdk, walletOpened, currentToken, currentChain, publicClient, config } = useDemoStore();

  const [transferAmount, setTransferAmount] = useState('0.1');
  const [transferTo, setTransferTo] = useState('');
  const [transferEstimate, setTransferEstimate] = useState<PlannerEstimateTransferResult | null>(null);
  const [transferEstimateLoading, setTransferEstimateLoading] = useState(false);
  const debouncedTransferAmount = useDebouncedValue(transferAmount, 400);

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

  const handleTransferMax = useCallback(() => {
    if (!transferEstimate || !currentToken) return;
    setTransferAmount(formatTokenAmount(transferEstimate.maxSummary.outputAmount, currentToken));
  }, [transferEstimate, currentToken]);

  const handleTransfer = useCallback(async () => {
    if (!sdk || !currentChain || !currentToken) return;
    if (!publicClient) {
      message.error('Public client not available');
      return;
    }
    if (!/^0x[0-9a-fA-F]{64}$/.test(transferTo)) {
      message.error('Recipient must be a 32-byte viewing address');
      return;
    }
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
        message.warning('Merge required: submit merge plan, sync, then retry transfer.');
        return;
      }

      const submit = await sdk.ops.submitRelayerRequest<Hex>({ prepared, publicClient });
      await submit.TransactionReceipt;
    } catch (error) {
      message.error(error instanceof Error ? error.message : String(error));
    }
  }, [sdk, currentChain, currentToken, publicClient, transferTo, transferAmount, config.seed, config.accountNonce]);

  const transferFeeRows = useMemo(
    () =>
      formatFeeRows([
        { label: 'relayerFee', value: transferEstimate ? formatTokenAmount(transferEstimate.relayerFee, currentToken) : '' },
        { label: 'required', value: transferEstimate ? formatTokenAmount(transferEstimate.required, currentToken) : '' },
        { label: 'mergeCount', value: transferEstimate ? String(transferEstimate.feeSummary.mergeCount) : '' },
        { label: 'feeCount', value: transferEstimate ? String(transferEstimate.feeSummary.feeCount) : '' },
        { label: 'inputCount', value: transferEstimate ? String(transferEstimate.feeSummary.inputCount) : '' },
        { label: 'relayerFeeTotal', value: transferEstimate ? formatTokenAmount(transferEstimate.feeSummary.relayerFeeTotal, currentToken) : '' },
        { label: 'protocolFeeTotal', value: transferEstimate ? formatTokenAmount(transferEstimate.feeSummary.protocolFeeTotal, currentToken) : '' },
        { label: 'cost', value: transferEstimate ? formatTokenAmount(transferEstimate.feeSummary.cost, currentToken) : '' },
        { label: 'maxOutput', value: transferEstimate ? formatTokenAmount(transferEstimate.maxSummary.outputAmount, currentToken) : '' },
      ]),
    [transferEstimate, currentToken]
  );

  const transferNotice = !walletOpened ? 'Initialize the SDK to open the wallet.' : '';

  return (
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
        feeError=""
        feeOk={transferEstimate?.ok}
        feeOkWithMerge={transferEstimate?.okWithMerge}
        notice={transferNotice}
      />
    </section>
  );
}
