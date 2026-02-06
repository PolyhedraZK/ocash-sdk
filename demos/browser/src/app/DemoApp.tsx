import type { DemoConfig } from './constants';
import { useDemoController } from './hooks/useDemoController';
import {
  ActivityPanel,
  AssetContextPanel,
  BalancesPanel,
  ConfigPanel,
  DepositPanel,
  EntryMemosPanel,
  EntryNullifiersPanel,
  OperationsPanel,
  TransferPanel,
  UtxosPanel,
  WalletPanel,
  WithdrawPanel,
} from './sections';

export function DemoApp({ config }: { config: DemoConfig }) {
  const controller = useDemoController({ config });

  return (
    <div className="app">
      <div className="header">
        <h1>OCash SDK Browser Demo</h1>
        <p>Browser SDK + wagmi/viem wallet flow for deposit, transfer, withdraw, and history.</p>
      </div>

      <div className="grid">
        <ConfigPanel
          configText={controller.configText}
          initSdk={controller.initSdk}
          closeWallet={controller.closeWallet}
          sdk={controller.sdk}
          sdkStatus={controller.sdkStatus}
          walletOpened={controller.walletOpened}
          statusLabel={controller.statusLabel}
          coreProgress={controller.coreProgress}
        />

        <WalletPanel
          isConnected={controller.isConnected}
          connectors={controller.connectors}
          connect={controller.connect}
          disconnect={controller.disconnect}
          address={controller.address}
          walletChainId={controller.walletChainId}
          viewingAddress={controller.viewingAddress}
          viewingAddressFromSeed={controller.viewingAddressFromSeed}
          config={config}
          chainMismatch={controller.chainMismatch}
          selectedChainId={controller.selectedChainId}
          currentChain={controller.currentChain}
          syncOnce={controller.syncOnce}
          sdk={controller.sdk}
          walletOpened={controller.walletOpened}
          actionMessage={controller.actionMessage}
        />

        <AssetContextPanel
          config={config}
          selectedChainId={controller.selectedChainId}
          setSelectedChainId={controller.setSelectedChainId}
          selectedTokenId={controller.selectedTokenId}
          setSelectedTokenId={controller.setSelectedTokenId}
          currentTokens={controller.currentTokens}
        />

        <DepositPanel
          depositAmount={controller.depositAmount}
          setDepositAmount={controller.setDepositAmount}
          handleDepositMax={controller.handleDepositMax}
          handleDeposit={controller.handleDeposit}
          sdk={controller.sdk}
          walletOpened={controller.walletOpened}
          currentToken={controller.currentToken}
          depositFeeRows={controller.depositFeeRows}
          depositEstimateLoading={controller.depositEstimateLoading}
          depositNotice={controller.depositNotice}
        />

        <TransferPanel
          transferAmount={controller.transferAmount}
          setTransferAmount={controller.setTransferAmount}
          transferTo={controller.transferTo}
          setTransferTo={controller.setTransferTo}
          handleTransferMax={controller.handleTransferMax}
          handleTransfer={controller.handleTransfer}
          sdk={controller.sdk}
          walletOpened={controller.walletOpened}
          currentToken={controller.currentToken}
          transferFeeRows={controller.transferFeeRows}
          transferEstimateLoading={controller.transferEstimateLoading}
          transferEstimate={controller.transferEstimate}
          transferNotice={controller.transferNotice}
        />

        <WithdrawPanel
          withdrawAmount={controller.withdrawAmount}
          setWithdrawAmount={controller.setWithdrawAmount}
          withdrawRecipient={controller.withdrawRecipient}
          setWithdrawRecipient={controller.setWithdrawRecipient}
          handleWithdrawMax={controller.handleWithdrawMax}
          handleWithdraw={controller.handleWithdraw}
          sdk={controller.sdk}
          walletOpened={controller.walletOpened}
          currentToken={controller.currentToken}
          withdrawFeeRows={controller.withdrawFeeRows}
          withdrawEstimateLoading={controller.withdrawEstimateLoading}
          withdrawEstimate={controller.withdrawEstimate}
          withdrawNotice={controller.withdrawNotice}
        />

        <BalancesPanel balances={controller.balances} refreshBalances={controller.refreshBalances} walletOpened={controller.walletOpened} sdk={controller.sdk} />

        <UtxosPanel
          utxos={controller.utxos}
          utxoFilter={controller.utxoFilter}
          setUtxoFilter={controller.setUtxoFilter}
          utxoPage={controller.utxoPage}
          setUtxoPage={controller.setUtxoPage}
          utxoTotal={controller.utxoTotal}
          refreshUtxos={controller.refreshUtxos}
          walletOpened={controller.walletOpened}
          sdk={controller.sdk}
          tokenInfoById={controller.tokenInfoById}
        />

        <EntryMemosPanel
          memoRows={controller.memoRows}
          memoPage={controller.memoPage}
          memoTotal={controller.memoTotal}
          memoLoading={controller.memoLoading}
          setMemoPage={controller.setMemoPage}
          refreshEntryMemos={controller.refreshEntryMemos}
          walletOpened={controller.walletOpened}
          sdk={controller.sdk}
        />

        <EntryNullifiersPanel
          nullifierRows={controller.nullifierRows}
          nullifierPage={controller.nullifierPage}
          nullifierTotal={controller.nullifierTotal}
          nullifierLoading={controller.nullifierLoading}
          setNullifierPage={controller.setNullifierPage}
          refreshEntryNullifiers={controller.refreshEntryNullifiers}
          walletOpened={controller.walletOpened}
          sdk={controller.sdk}
        />

        <OperationsPanel operations={controller.operations} />

        <ActivityPanel actionMessage={controller.actionMessage} logs={controller.logs} />
      </div>
    </div>
  );
}
