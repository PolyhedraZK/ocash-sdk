import React, { useMemo } from 'react';
import { useSelector } from 'react-redux';
import {
  Box,
  Tag,
  Text,
} from '../../component-library';
import {
  Display,
  FlexDirection,
  JustifyContent,
  AlignItems,
  TextColor,
  TextVariant,
} from '../../../helpers/constants/design-system';
import { getSelectedInternalAccount } from '../../../selectors';
import { useOcashLedger } from '../../../hooks/ocash/use-ocash-ledger';
import { getOcashTokenById } from '../../../constants/ocash';

type OcashActivityListProps = {
  chainId?: string;
  assetAddress?: string;
  limit?: number;
  className?: string;
  emptyText?: string;
};

function getActionLabel(kind: 'deposit' | 'withdraw' | 'transfer' | string) {
  if (kind === 'deposit') {
    return 'Deposit';
  }
  if (kind === 'withdraw') {
    return 'Withdraw';
  }
  return 'Transfer';
}

function formatUnits(unitsText: string | undefined, decimals = 18) {
  if (!unitsText) {
    return '0';
  }
  let units = 0n;
  try {
    units = BigInt(unitsText);
  } catch {
    return '0';
  }
  if (decimals === 0) {
    return units.toString();
  }

  const abs = units < 0n ? -units : units;
  const text = abs.toString().padStart(decimals + 1, '0');
  const intPart = text.slice(0, -decimals);
  const fracPart = text.slice(-decimals).replace(/0+$/u, '');
  return fracPart ? `${intPart}.${fracPart}` : intPart;
}

export const OcashActivityList = ({
  chainId,
  assetAddress,
  limit = 20,
  className,
  emptyText,
}: OcashActivityListProps) => {
  const selectedAccount = useSelector(getSelectedInternalAccount);
  const { operations } = useOcashLedger(selectedAccount?.address);

  const filtered = useMemo(
    () =>
      operations
        .filter((item) =>
          chainId ? item.chainId === Number.parseInt(chainId, 16) : true,
        )
        .filter((item) => {
          if (!assetAddress || !chainId || !item.tokenId) {
            return true;
          }
          const token = getOcashTokenById(chainId, item.tokenId);
          return token?.wrappedErc20.toLowerCase() === assetAddress.toLowerCase();
        })
        .filter((item) =>
          item.type === 'deposit' ||
          item.type === 'withdraw' ||
          item.type === 'transfer',
        )
        .slice(0, limit),
    [assetAddress, chainId, limit, operations],
  );

  const getTokenForOperation = (item: (typeof filtered)[number]) => {
    const tokenChainId = chainId ?? `0x${item.chainId?.toString(16)}`;
    return getOcashTokenById(tokenChainId, item.tokenId);
  };

  if (filtered.length === 0) {
    if (!emptyText) {
      return null;
    }

    return (
      <Box paddingInline={4} paddingTop={3} paddingBottom={3}>
        <Text variant={TextVariant.bodySm} color={TextColor.textAlternative}>
          {emptyText}
        </Text>
      </Box>
    );
  }

  return (
    <Box
      className={className}
      display={Display.Flex}
      flexDirection={FlexDirection.Column}
    >
      {filtered.map((item) => {
        const token = getTokenForOperation(item);
        return (
          <Box
            key={item.id}
            paddingInline={4}
            paddingTop={3}
            paddingBottom={3}
            display={Display.Flex}
            justifyContent={JustifyContent.spaceBetween}
            alignItems={AlignItems.center}
            style={{ borderBottom: '1px solid var(--color-border-muted)' }}
          >
            <Box
              display={Display.Flex}
              flexDirection={FlexDirection.Column}
              style={{ minWidth: 0 }}
            >
              <Box display={Display.Flex} alignItems={AlignItems.center} gap={2}>
                <Text variant={TextVariant.bodyMdMedium}>
                  {getActionLabel(item.type)}{' '}
                  {(item.detail as { token?: string } | undefined)?.token ??
                    token?.symbol ??
                    ''}
                </Text>
                <Tag label="OCash" />
              </Box>
              <Text
                variant={TextVariant.bodySm}
                color={TextColor.textAlternative}
                style={{ marginTop: 4 }}
              >
                {new Date(item.createdAt).toLocaleString()}
              </Text>
            </Box>
            <Text
              variant={TextVariant.bodyMdMedium}
            >
              {item.type === 'deposit' ? '+' : '-'}
              {formatUnits(
                (item.detail as { amount?: string } | undefined)?.amount,
                token?.decimals ?? 18,
              )}
            </Text>
          </Box>
        );
      })}
    </Box>
  );
};
