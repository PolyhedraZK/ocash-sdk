import React from 'react';
import { Hex } from '@metamask/utils';
import { useSelector } from 'react-redux';
import { AssetType } from '../../../../shared/constants/transaction';
import { Box } from '../../../components/component-library';
import { type OcashTokenConfig } from '../../../constants/ocash';
import { getSelectedInternalAccount } from '../../../selectors';
import { useOcashLedger } from '../../../hooks/ocash/use-ocash-ledger';
import { OcashActivityList } from '../../../components/multichain/account-overview/ocash-activity-list';
import AssetPage from './asset-page';
import { OcashAssetButtons } from './ocash-asset-buttons';

type OcashAssetProps = {
  chainId: Hex;
  token: OcashTokenConfig;
};

const OcashAsset = ({ chainId, token }: OcashAssetProps) => {
  const selectedAccount = useSelector(getSelectedInternalAccount);
  const { getBalanceDisplay, getBalanceUnits } = useOcashLedger(
    selectedAccount?.address,
    chainId,
  );
  const balanceDisplay = getBalanceDisplay(
    chainId,
    token.wrappedErc20,
    token.decimals,
  );
  const balanceUnits = getBalanceUnits(chainId, token.wrappedErc20);

  return (
    <AssetPage
      asset={{
        chainId,
        type: AssetType.token,
        address: token.wrappedErc20,
        symbol: token.symbol,
        name: token.symbol,
        decimals: token.decimals,
        image: '',
        balance: {
          value: balanceUnits.toString(),
          display: balanceDisplay,
          fiat: '0',
        },
      }}
      optionsButton={<Box />}
      actionButtons={
        <OcashAssetButtons
          chainId={chainId}
          address={token.wrappedErc20}
          symbol={token.symbol}
        />
      }
      activityContent={
        <OcashActivityList
          chainId={chainId}
          assetAddress={token.wrappedErc20}
          emptyText="暂无 OCash 活动记录。"
        />
      }
    />
  );
};

export default OcashAsset;
