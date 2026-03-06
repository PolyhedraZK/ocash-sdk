import React from 'react';
import { Hex } from '@metamask/utils';
import { useSelector } from 'react-redux';
import { AssetType } from '../../../../shared/constants/transaction';
import {
  Box,
  Text,
} from '../../../components/component-library';
import {
  Display,
  FlexDirection,
  TextColor,
  TextVariant,
} from '../../../helpers/constants/design-system';
import { type OcashTokenConfig } from '../../../constants/ocash';
import { getSelectedInternalAccount } from '../../../selectors';
import { useOcashLedger } from '../../../hooks/ocash/use-ocash-ledger';
import { OcashActivityList } from '../../../components/multichain/account-overview/ocash-activity-list';
import { AddressCopyButton } from '../../../components/multichain';
import AssetPage from './asset-page';
import { OcashAssetButtons } from './ocash-asset-buttons';

type OcashAssetProps = {
  chainId: Hex;
  token: OcashTokenConfig;
};

function formatTokenAmount(units: bigint, decimals: number): string {
  if (decimals === 0) return units.toString();
  const negative = units < 0n;
  const abs = negative ? -units : units;
  const text = abs.toString().padStart(decimals + 1, '0');
  const intPart = text.slice(0, -decimals);
  const fracPart = text.slice(-decimals).replace(/0+$/u, '');
  const body = fracPart ? `${intPart}.${fracPart}` : intPart;
  return negative ? `-${body}` : body;
}

const OcashAsset = ({ chainId, token }: OcashAssetProps) => {
  const selectedAccount = useSelector(getSelectedInternalAccount);
  const { getBalanceDisplay, getBalanceUnits, getUnspentUtxos } = useOcashLedger(
    selectedAccount?.address,
    chainId,
  );
  const balanceDisplay = getBalanceDisplay(
    chainId,
    token.wrappedErc20,
    token.decimals,
  );
  const balanceUnits = getBalanceUnits(chainId, token.wrappedErc20);
  const unspentUtxos = getUnspentUtxos(chainId, token.wrappedErc20);

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
      tokenDetailsExtraContent={
        <Box
          display={Display.Flex}
          flexDirection={FlexDirection.Column}
          gap={2}
          marginTop={2}
        >
          <Text
            variant={TextVariant.bodyMdMedium}
            color={TextColor.textAlternative}
          >
            未花费 UTXO: {unspentUtxos.length}
          </Text>
          {unspentUtxos.length > 0 ? (
            <Box display={Display.Flex} flexDirection={FlexDirection.Column} gap={2}>
              {unspentUtxos.map((utxo) => (
                <Box
                  key={utxo.commitment}
                  display={Display.Flex}
                  flexDirection={FlexDirection.Column}
                  gap={1}
                >
                  <Text variant={TextVariant.bodyMdMedium}>
                    金额: {formatTokenAmount(utxo.amount, token.decimals)} {token.symbol}
                  </Text>
                  <Text variant={TextVariant.bodyMdMedium}>
                    mkIndex: {utxo.mkIndex}
                  </Text>
                  <Box
                    display={Display.Flex}
                    flexDirection={FlexDirection.Column}
                    gap={1}
                  >
                    <Text variant={TextVariant.bodyMdMedium}>commitment:</Text>
                    <AddressCopyButton address={utxo.commitment} shorten />
                    <Text variant={TextVariant.bodyMdMedium}>nullifier:</Text>
                    <AddressCopyButton address={utxo.nullifier} shorten />
                  </Box>
                </Box>
              ))}
            </Box>
          ) : (
            <Text variant={TextVariant.bodyMdMedium} color={TextColor.textAlternative}>
              当前无未花费 UTXO。
            </Text>
          )}
        </Box>
      }
    />
  );
};

export default OcashAsset;
