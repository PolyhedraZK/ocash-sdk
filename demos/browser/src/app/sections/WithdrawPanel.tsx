import type { DemoController } from '../hooks/useDemoController';
import { WithdrawForm } from '../components';

export function WithdrawPanel({
  withdrawAmount,
  setWithdrawAmount,
  withdrawRecipient,
  setWithdrawRecipient,
  handleWithdrawMax,
  handleWithdraw,
  sdk,
  walletOpened,
  currentToken,
  withdrawFeeRows,
  withdrawEstimateLoading,
  withdrawEstimate,
  withdrawNotice,
}: Pick<
  DemoController,
  | 'withdrawAmount'
  | 'setWithdrawAmount'
  | 'withdrawRecipient'
  | 'setWithdrawRecipient'
  | 'handleWithdrawMax'
  | 'handleWithdraw'
  | 'sdk'
  | 'walletOpened'
  | 'currentToken'
  | 'withdrawFeeRows'
  | 'withdrawEstimateLoading'
  | 'withdrawEstimate'
  | 'withdrawNotice'
>) {
  return (
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
        feeError=""
        feeOk={withdrawEstimate?.ok}
        feeOkWithMerge={withdrawEstimate?.okWithMerge}
        notice={withdrawNotice}
      />
    </section>
  );
}
