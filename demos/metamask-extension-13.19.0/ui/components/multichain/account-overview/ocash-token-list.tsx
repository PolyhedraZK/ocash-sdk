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
  const { getBalanceDisplay } = useOcashLedger(selectedAccount?.address);

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
