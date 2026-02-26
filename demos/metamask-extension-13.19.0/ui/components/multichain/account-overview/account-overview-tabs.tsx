import React, { useCallback, useContext, useEffect, useMemo } from 'react';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { Hex, isStrictHexString } from '@metamask/utils';
import { toEvmCaipChainId } from '@metamask/multichain-network-controller';
import ErrorBoundary from '../../app/error-boundary/error-boundary';
import {
  ACCOUNT_OVERVIEW_TAB_KEY_TO_METAMETRICS_EVENT_NAME_MAP,
  ACCOUNT_OVERVIEW_TAB_KEY_TO_TRACE_NAME_MAP,
  AccountOverviewTabKey,
  AccountOverviewTab,
} from '../../../../shared/constants/app-state';
import { MetaMetricsEventCategory } from '../../../../shared/constants/metametrics';
import { endTrace, trace } from '../../../../shared/lib/trace';
import { MetaMetricsContext } from '../../../contexts/metametrics';
import { ASSET_ROUTE } from '../../../helpers/constants/routes';
import { useI18nContext } from '../../../hooks/useI18nContext';
import { useTabState } from '../../../hooks/useTabState';
import { useSafeChains } from '../../../pages/settings/networks-tab/networks-form/use-safe-chains';
import {
  getDefaultHomeActiveTabName,
  getEnabledChainIds,
  getIsMultichainAccountsState2Enabled,
} from '../../../selectors';
import {
  getAllEnabledNetworksForAllNamespaces,
  getSelectedMultichainNetworkConfiguration,
} from '../../../selectors/multichain/networks';
import { setDefaultHomeActiveTabName } from '../../../store/actions';
import AssetList from '../../app/assets/asset-list';
import TransactionList from '../../app/transaction-list';
import UnifiedTransactionList from '../../app/transaction-list/unified-transaction-list.component';
import { Tab, Tabs } from '../../ui/tabs';
import { useTokenBalances } from '../../../hooks/useTokenBalances';
import { AccountOverviewCommonProps } from './common';
import { AssetListTokenDetection } from './asset-list-token-detection';
import { isOcashSupportedChain } from '../../../constants/ocash';
import { OcashTokenList } from './ocash-token-list';
import { OcashActivityList } from './ocash-activity-list';

export type AccountOverviewTabsProps = AccountOverviewCommonProps & {
  showTokens: boolean;
  showOcash: boolean;
  showTokensLinks?: boolean;
  showActivity: boolean;
};

export const AccountOverviewTabs = ({
  showTokens,
  showOcash,
  showTokensLinks,
  showActivity,
}: AccountOverviewTabsProps) => {
  const persistedTab = useSelector(getDefaultHomeActiveTabName);
  const [urlTab, setActiveTabKey] = useTabState();
  const activeTabKey = urlTab || persistedTab;

  const navigate = useNavigate();
  const t = useI18nContext();
  const { trackEvent } = useContext(MetaMetricsContext);
  const selectedChainIds = useSelector(getEnabledChainIds);
  const visibleTabKeys: AccountOverviewTab[] = [
    ...(showTokens ? [AccountOverviewTabKey.Tokens] : []),
    ...(showOcash ? [AccountOverviewTabKey.OCash] : []),
    ...(showActivity ? [AccountOverviewTabKey.Activity] : []),
  ];
  const effectiveActiveTabKey = visibleTabKeys.includes(activeTabKey)
    ? activeTabKey
    : visibleTabKeys[0];

  useEffect(() => {
    if (
      effectiveActiveTabKey &&
      effectiveActiveTabKey in ACCOUNT_OVERVIEW_TAB_KEY_TO_TRACE_NAME_MAP
    ) {
      setDefaultHomeActiveTabName(effectiveActiveTabKey);
    }
  }, [effectiveActiveTabKey]);

  // Get all enabled networks (what the user has actually selected)
  const allEnabledNetworks = useSelector(getAllEnabledNetworksForAllNamespaces);

  // Convert enabled networks to CAIP format for metrics
  const networkFilterForMetrics = useMemo(
    () =>
      allEnabledNetworks.map((chainId) =>
        isStrictHexString(chainId) ? toEvmCaipChainId(chainId) : chainId,
      ),
    [allEnabledNetworks],
  );

  // EVM specific tokenBalance polling, updates state via polling loop per chainId
  useTokenBalances({
    chainIds: selectedChainIds as Hex[],
  });

  const handleTabClick = useCallback(
    (tabName: AccountOverviewTab) => {
      if (activeTabKey in ACCOUNT_OVERVIEW_TAB_KEY_TO_TRACE_NAME_MAP) {
        endTrace({
          name: ACCOUNT_OVERVIEW_TAB_KEY_TO_TRACE_NAME_MAP[activeTabKey],
        });
      }

      setActiveTabKey(tabName);

      if (tabName in ACCOUNT_OVERVIEW_TAB_KEY_TO_METAMETRICS_EVENT_NAME_MAP) {
        trackEvent({
          category: MetaMetricsEventCategory.Home,
          event:
            ACCOUNT_OVERVIEW_TAB_KEY_TO_METAMETRICS_EVENT_NAME_MAP[
              tabName as keyof typeof ACCOUNT_OVERVIEW_TAB_KEY_TO_METAMETRICS_EVENT_NAME_MAP
            ],
          properties: {
            // eslint-disable-next-line @typescript-eslint/naming-convention
            network_filter: networkFilterForMetrics,
          },
        });
      }
      if (tabName in ACCOUNT_OVERVIEW_TAB_KEY_TO_TRACE_NAME_MAP) {
        trace({
          name: ACCOUNT_OVERVIEW_TAB_KEY_TO_TRACE_NAME_MAP[tabName],
        });
      }
    },
    [
      activeTabKey,
      networkFilterForMetrics,
      setActiveTabKey,
      trackEvent,
    ],
  );

  const onClickAsset = useCallback(
    (chainId: string, asset: string) =>
      navigate(`${ASSET_ROUTE}/${chainId}/${encodeURIComponent(asset)}`),
    [navigate],
  );

  const { safeChains } = useSafeChains();

  const isBIP44FeatureFlagEnabled = useSelector(
    getIsMultichainAccountsState2Enabled,
  );
  const showUnifiedTransactionList = isBIP44FeatureFlagEnabled;

  const currentChainId = useSelector(
    getSelectedMultichainNetworkConfiguration,
  )?.chainId;
  const isCurrentChainOcashSupported = isOcashSupportedChain(currentChainId);

  return (
    <>
      <AssetListTokenDetection />

      <Tabs<AccountOverviewTab>
        activeTab={effectiveActiveTabKey}
        onTabClick={handleTabClick}
        tabListProps={{
          className: 'px-4',
        }}
      >
        {showTokens && (
          <Tab
            name={t('tokens')}
            tabKey={AccountOverviewTabKey.Tokens}
            data-testid="account-overview__asset-tab"
          >
            <ErrorBoundary key="tokens">
              <AssetList
                showTokensLinks={showTokensLinks ?? true}
                onClickAsset={onClickAsset}
                safeChains={safeChains}
              />
            </ErrorBoundary>
          </Tab>
        )}

        {showOcash && (
          <Tab
            name="OCash"
            tabKey={AccountOverviewTabKey.OCash}
            data-testid="account-overview__ocash-tab"
          >
            <ErrorBoundary key="ocash">
              {isCurrentChainOcashSupported ? (
                <OcashTokenList chainId={currentChainId} />
              ) : (
                <div className="mx-4 mt-3 rounded-lg border border-warning-muted bg-warning-muted p-3 text-warning-default text-sm">
                  当前网络不支持 OCash SDK，请切换到受支持网络。
                </div>
              )}
            </ErrorBoundary>
          </Tab>
        )}

        {showActivity && (
          <Tab
            name={t('activity')}
            tabKey={AccountOverviewTabKey.Activity}
            data-testid="account-overview__activity-tab"
          >
            <ErrorBoundary key="activity">
              <>
                <OcashActivityList className="mb-2" />
                {showUnifiedTransactionList ? (
                  <UnifiedTransactionList />
                ) : (
                  <TransactionList />
                )}
              </>
            </ErrorBoundary>
          </Tab>
        )}
      </Tabs>
    </>
  );
};
