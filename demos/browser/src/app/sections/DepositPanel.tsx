import type { DemoController } from '../hooks/useDemoController';
import { DepositForm } from '../components';

export function DepositPanel({
  depositAmount,
  setDepositAmount,
  handleDepositMax,
  handleDeposit,
  sdk,
  walletOpened,
  currentToken,
  depositFeeRows,
  depositEstimateLoading,
  depositNotice,
}: Pick<
  DemoController,
  | 'depositAmount'
  | 'setDepositAmount'
  | 'handleDepositMax'
  | 'handleDeposit'
  | 'sdk'
  | 'walletOpened'
  | 'currentToken'
  | 'depositFeeRows'
  | 'depositEstimateLoading'
  | 'depositNotice'
>) {
  return (
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
        feeError=""
        notice={depositNotice}
      />
    </section>
  );
}
