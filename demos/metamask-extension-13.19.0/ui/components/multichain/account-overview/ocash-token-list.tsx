import React from 'react';
import { useSelector } from 'react-redux';
import { type Hex } from '@metamask/utils';
import { useNavigate } from 'react-router-dom';
import TokenCell from '../../app/assets/token-cell';
import { type TokenWithFiatAmount } from '../../app/assets/types';
import { ASSET_ROUTE } from '../../../helpers/constants/routes';
import { getPreferences } from '../../../selectors';
import { isEvmChainId } from '../../../../shared/lib/asset-utils';
import { getOcashChainConfig } from '../../../constants/ocash';
import { getSelectedInternalAccount } from '../../../selectors';
import { useOcashLedger } from '../../../hooks/ocash/use-ocash-ledger';

type OcashTokenListProps = {
  chainId: string | undefined;
};

export const OcashTokenList = ({ chainId }: OcashTokenListProps) => {
  const navigate = useNavigate();
  const chainConfig = getOcashChainConfig(chainId);
  const { privacyMode = false } = useSelector(getPreferences);
  const selectedAccount = useSelector(getSelectedInternalAccount);
  const { getBalanceDisplay, syncState } = useOcashLedger(
    selectedAccount?.address,
    chainConfig?.chainId,
  );

  if (!chainConfig) {
    return null;
  }

  const tokens: TokenWithFiatAmount[] = chainConfig.tokens.map((token) => ({
    address: token.wrappedErc20 as Hex,
    symbol: token.symbol,
    image: '',
    decimals: token.decimals,
    chainId: chainConfig.chainId as Hex,
    title: token.symbol,
    balance: getBalanceDisplay(
      chainConfig.chainId,
      token.wrappedErc20,
      token.decimals,
    ),
    tokenFiatAmount: null,
    secondary: null,
    isNative:
      token.wrappedErc20.toLowerCase() ===
      '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
  }));

  const handleTokenClick = (token: TokenWithFiatAmount) => () => {
    if (!token.chainId) {
      return;
    }

    const tokenAddress =
      isEvmChainId(token.chainId) && token.isNative ? '' : token.address;

    navigate(`${ASSET_ROUTE}/${token.chainId}/${encodeURIComponent(tokenAddress)}`);
  };

  return (
    <div className="token-list-non-virtualized">
      <div className="mx-4 mt-3 rounded-lg border border-muted bg-muted p-3">
        <div className="text-xs text-muted">
          OCash 同步（当前链）
        </div>
        <div className="mt-1 text-sm">
          {syncState.status === 'syncing'
            ? `同步中：${syncState.syncedCommitments}/${syncState.totalCommitments ?? '?'} commitments`
            : syncState.status === 'synced'
              ? `已同步：${syncState.syncedCommitments}/${syncState.totalCommitments ?? '?'} commitments`
              : syncState.status === 'error'
                ? `同步失败：${syncState.error ?? '未知错误'}`
                : '等待同步'}
        </div>
        <div
          className="mt-2 h-1.5 w-full rounded"
          style={{ background: 'var(--color-background-default)' }}
        >
          <div
            className="h-full rounded"
            style={{
              width: `${
                syncState.totalCommitments && syncState.totalCommitments > 0
                  ? Math.max(
                      0,
                      Math.min(
                        100,
                        Math.round(
                          (syncState.syncedCommitments / syncState.totalCommitments) * 100,
                        ),
                      ),
                    )
                  : 0
              }%`,
              background: 'var(--color-primary-default)',
              transition: 'width 0.2s ease',
            }}
          />
        </div>

        <div className="mt-3 text-xs text-muted">
          <div>chainId: {chainConfig.chainId}</div>
          <div>rpcUrl: {chainConfig.rpcUrl ?? '-'}</div>
          <div>entryUrl: {chainConfig.entryUrl ?? '-'}</div>
          <div>merkleProofUrl: {chainConfig.merkleProofUrl ?? '-'}</div>
          <div>relayerUrl: {chainConfig.relayerUrl ?? '-'}</div>
          <div>ocashContractAddress: {chainConfig.ocashContractAddress ?? '-'}</div>
        </div>
      </div>

      {tokens.length === 0 ? (
        <div className="mx-4 mt-3 rounded-lg border border-muted bg-muted p-3 text-muted text-sm">
          当前网络暂无 OCash 资产配置。
        </div>
      ) : (
        tokens.map((token) => (
          <TokenCell
            key={`${token.chainId}-${token.symbol}-${token.address}`}
            token={token}
            privacyMode={privacyMode}
            onClick={handleTokenClick(token)}
          />
        ))
      )}
    </div>
  );
};
