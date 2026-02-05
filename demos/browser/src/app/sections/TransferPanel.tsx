import type { DemoController } from '../hooks/useDemoController';
import { TransferForm } from '../components';

export function TransferPanel({
  transferAmount,
  setTransferAmount,
  transferTo,
  setTransferTo,
  handleTransferMax,
  handleTransfer,
  sdk,
  walletOpened,
  currentToken,
  transferFeeRows,
  transferEstimateLoading,
  transferEstimate,
  transferNotice,
}: Pick<
  DemoController,
  | 'transferAmount'
  | 'setTransferAmount'
  | 'transferTo'
  | 'setTransferTo'
  | 'handleTransferMax'
  | 'handleTransfer'
  | 'sdk'
  | 'walletOpened'
  | 'currentToken'
  | 'transferFeeRows'
  | 'transferEstimateLoading'
  | 'transferEstimate'
  | 'transferNotice'
>) {
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
