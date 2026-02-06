import { useCallback, useEffect, useMemo, useState } from 'react';
import { message } from 'antd';
import type { Hex, PlannerEstimateWithdrawResult } from '@ocash/sdk';
import { getAddress, isAddress } from 'viem';
import { parseAmount } from '../../utils/format';
import { WithdrawForm } from '../components';
import { formatFeeRows, formatTokenAmount, useDebouncedValue } from '../utils';
import { useDemoStore } from '../state/demoStore';

export function WithdrawPanel() {
  const { sdk, walletOpened, currentToken, currentChain, publicClient, config } = useDemoStore();

  const [withdrawAmount, setWithdrawAmount] = useState('0.1');
  const [withdrawRecipient, setWithdrawRecipient] = useState('');
  const [withdrawEstimate, setWithdrawEstimate] = useState<PlannerEstimateWithdrawResult | null>(null);
  const [withdrawEstimateLoading, setWithdrawEstimateLoading] = useState(false);
  const debouncedWithdrawAmount = useDebouncedValue(withdrawAmount, 400);
  const [expanded, setExpanded] = useState(false);

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

  const handleWithdrawMax = useCallback(() => {
    if (!withdrawEstimate || !currentToken) return;
    setWithdrawAmount(formatTokenAmount(withdrawEstimate.maxSummary.outputAmount, currentToken));
  }, [withdrawEstimate, currentToken]);

  const handleWithdraw = useCallback(async () => {
    if (!sdk || !currentChain || !currentToken) return;
    if (!publicClient) {
      message.error('Public client not available');
      return;
    }
    if (!isAddress(withdrawRecipient)) {
      message.error('Recipient must be a valid EVM address');
      return;
    }
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

      const submit = await sdk.ops.submitRelayerRequest<Hex>({ prepared, publicClient });
      await submit.TransactionReceipt;
    } catch (error) {
      message.error(error instanceof Error ? error.message : String(error));
    }
  }, [sdk, currentChain, currentToken, publicClient, withdrawRecipient, withdrawAmount, config.seed, config.accountNonce]);

  const withdrawFeeRows = useMemo(
    () =>
      formatFeeRows([
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
      ]),
    [withdrawEstimate, currentToken]
  );

  const withdrawNotice = !walletOpened ? 'Initialize the SDK to open the wallet.' : '';

  return (
    <section className="panel span-4 panel-collapsible">
      <button type="button" className="panel-toggle" aria-expanded={expanded} onClick={() => setExpanded((prev) => !prev)}>
        <h2>Withdraw</h2>
      </button>
      {expanded ? (
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
          feeError=""
          feeOk={withdrawEstimate?.ok}
          feeOkWithMerge={withdrawEstimate?.okWithMerge}
          notice={withdrawNotice}
        />
      ) : null}
    </section>
  );
}
