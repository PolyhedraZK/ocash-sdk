import React, { useEffect, useMemo, useState } from 'react';
import { type Hex } from '@metamask/utils';
import type { AnyAction } from 'redux';
import type { ThunkDispatch } from 'redux-thunk';
import { useDispatch, useSelector } from 'react-redux';
import qrCode from 'qrcode-generator';
import {
  Box,
  Icon,
  IconName,
  IconSize,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Text,
  TextField,
  TextFieldType,
  ButtonPrimary,
  ButtonSecondary,
} from '../../../components/component-library';
import {
  Display,
  FlexDirection,
  IconColor,
  JustifyContent,
  TextColor,
  TextVariant,
} from '../../../helpers/constants/design-system';
import IconButton from '../../../components/ui/icon-button/icon-button';
import { useI18nContext } from '../../../hooks/useI18nContext';
import { Toast, ToastContainer } from '../../../components/multichain/toast';
import { getSelectedInternalAccount } from '../../../selectors';
import { useOcashLedger } from '../../../hooks/ocash/use-ocash-ledger';
import { useCopyToClipboard } from '../../../hooks/useCopyToClipboard';

type OcashActionKind = 'deposit' | 'withdraw' | 'transfer';

function OcashReceiveModal({
  address,
  onClose,
}: {
  address: string;
  onClose: () => void;
}) {
  const t = useI18nContext();
  const [copied, copyToClipboard] = useCopyToClipboard({ clearDelayMs: null });
  const qrImageUrl = useMemo(() => {
    try {
      // Auto-size avoids overflow errors for long OCash receive addresses.
      const qr = qrCode(0, 'M');
      qr.addData(address);
      qr.make();
      const imgTag = qr.createImgTag(5, 16);
      const srcMatch = imgTag.match(/src="([^"]+)"/u);
      return srcMatch ? srcMatch[1] : '';
    } catch {
      return '';
    }
  }, [address]);

  const addressStart = address.substring(0, 6);
  const addressMiddle = address.substring(6, Math.max(address.length - 5, 6));
  const addressEnd = address.substring(Math.max(address.length - 5, 6));

  return (
    <Modal isOpen onClose={onClose}>
      <ModalOverlay />
      <ModalContent>
        <ModalHeader onClose={onClose}>{t('receive')}</ModalHeader>
        <ModalBody>
          <Box
            display={Display.Flex}
            flexDirection={FlexDirection.Column}
            style={{ alignItems: 'center' }}
          >
            {qrImageUrl ? (
              <img
                src={qrImageUrl}
                alt="OCash receive address QR code"
                style={{ marginBottom: 16 }}
              />
            ) : null}
            <Text variant={TextVariant.bodyMdMedium}>
              {addressStart}
              <Text
                variant={TextVariant.bodyMdMedium}
                color={TextColor.textAlternative}
              >
                {addressMiddle}
              </Text>
              {addressEnd}
            </Text>
            <Box style={{ marginTop: 12 }}>
              <ButtonSecondary onClick={() => copyToClipboard(address)}>
                {copied ? t('addressCopied') : t('copyAddressShort')}
              </ButtonSecondary>
            </Box>
          </Box>
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}

type ActionModalState =
  | { open: false }
  | {
      open: true;
      kind: OcashActionKind;
    };

type ActionModalProps = {
  state: ActionModalState;
  symbol: string;
  onClose: () => void;
  onConfirm: (input: {
    amount: string;
    recipient?: string;
  }) => void;
  isSubmitting: boolean;
};

function ActionModal({
  state,
  symbol,
  onClose,
  onConfirm,
  isSubmitting,
}: ActionModalProps) {
  const [amount, setAmount] = useState('');
  const [recipient, setRecipient] = useState('');

  useEffect(() => {
    if (state.open) {
      setAmount('');
      setRecipient('');
    }
  }, [state]);

  const title = useMemo(() => {
    if (!state.open) {
      return '';
    }
    if (state.kind === 'deposit') {
      return `Deposit ${symbol}`;
    }
    if (state.kind === 'withdraw') {
      return `Withdraw ${symbol}`;
    }
    return `Transfer ${symbol}`;
  }, [state, symbol]);

  const showRecipient = state.open && state.kind === 'transfer';

  if (!state.open) {
    return null;
  }

  return (
    <Modal isOpen onClose={onClose}>
      <ModalOverlay />
      <ModalContent>
        <ModalHeader onClose={onClose}>{title}</ModalHeader>
        <ModalBody>
          <Box display={Display.Flex} flexDirection={FlexDirection.Column} gap={3}>
            <TextField
              value={amount}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setAmount(e.target.value)
              }
              type={TextFieldType.Number}
              placeholder={`Amount (${symbol})`}
              autoFocus
            />
            {showRecipient ? (
              <TextField
                value={recipient}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setRecipient(e.target.value)
                }
                type={TextFieldType.Text}
                placeholder="OCash recipient (0x + 64 hex)"
              />
            ) : null}
          </Box>
        </ModalBody>
        <ModalFooter>
          <ButtonSecondary onClick={onClose} disabled={isSubmitting}>
            Cancel
          </ButtonSecondary>
          <ButtonPrimary
            onClick={() =>
              onConfirm({
                amount,
                recipient: recipient.trim() || undefined,
              })
            }
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Submitting...' : 'Confirm'}
          </ButtonPrimary>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

type OcashAssetButtonsProps = {
  chainId: Hex;
  address: string;
  symbol: string;
};

export const OcashAssetButtons = ({
  chainId,
  address,
  symbol,
}: OcashAssetButtonsProps) => {
  const dispatch = useDispatch<ThunkDispatch<unknown, unknown, AnyAction>>();
  const t = useI18nContext();
  const selectedAccount = useSelector(getSelectedInternalAccount);
  const selectedAddress = selectedAccount?.address;
  const { submitOperation, getReceiveAddress, unlockWallet, hasUnlockedSeed } =
    useOcashLedger(selectedAddress, chainId);
  const [showUnlockModal, setShowUnlockModal] = useState(false);
  const [unlockPassword, setUnlockPassword] = useState('');
  const [ocashReceiveAddress, setOcashReceiveAddress] = useState<string | null>(
    null,
  );
  const [actionModalState, setActionModalState] = useState<ActionModalState>({
    open: false,
  });
  const [toastState, setToastState] = useState<{
    text: string;
    variant: 'info' | 'error';
  } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingReceiveAddress, setIsLoadingReceiveAddress] = useState(false);
  const [isUnlocking, setIsUnlocking] = useState(false);

  const handleConfirmAction = async ({
    amount,
    recipient,
  }: {
    amount: string;
    recipient?: string;
  }) => {
    if (!actionModalState.open || !selectedAddress) {
      return;
    }
    if (!hasUnlockedSeed) {
      setActionModalState({ open: false });
      setShowUnlockModal(true);
      return;
    }

    setIsSubmitting(true);
    const result = await submitOperation({
      kind: actionModalState.kind,
      account: selectedAddress,
      chainId,
      assetAddress: address,
      amount,
      recipient,
      dispatch,
    });
    setIsSubmitting(false);

    if (!result.ok) {
      setToastState({ text: result.error, variant: 'error' });
      return;
    }

    setActionModalState({ open: false });
    setToastState({
      text: `OCash ${actionModalState.kind} 已记录`,
      variant: 'info',
    });
  };

  const handleOpenReceiveAddress = async () => {
    if (!selectedAddress) {
      return;
    }
    if (!hasUnlockedSeed) {
      setShowUnlockModal(true);
      return;
    }

    setIsLoadingReceiveAddress(true);
    const result = await getReceiveAddress({
      account: selectedAddress,
      chainId,
    });
    setIsLoadingReceiveAddress(false);

    if (!result.ok) {
      setToastState({ text: result.error, variant: 'error' });
      return;
    }

    setOcashReceiveAddress(result.address);
  };

  const handleUnlock = async () => {
    if (!selectedAddress || !unlockPassword.trim()) {
      return;
    }
    setIsUnlocking(true);
    const result = await unlockWallet({
      account: selectedAddress,
      chainId,
      password: unlockPassword,
    });
    setIsUnlocking(false);
    if (!result.ok) {
      setToastState({ text: result.error, variant: 'error' });
      return;
    }
    setShowUnlockModal(false);
    setUnlockPassword('');
    setToastState({ text: 'OCash 已解锁', variant: 'info' });
  };

  return (
    <>
      <Box
        display={Display.Flex}
        gap={3}
        justifyContent={JustifyContent.spaceEvenly}
      >
        <IconButton
          className="token-overview__button"
          onClick={() => setActionModalState({ open: true, kind: 'deposit' })}
          Icon={
            <Icon
              name={IconName.Upload}
              color={IconColor.iconAlternative}
              size={IconSize.Md}
            />
          }
          label="Deposit"
          data-testid="ocash-overview-deposit"
        />
        <IconButton
          className="token-overview__button"
          onClick={() => setActionModalState({ open: true, kind: 'withdraw' })}
          Icon={
            <Icon
              name={IconName.Download}
              color={IconColor.iconAlternative}
              size={IconSize.Md}
            />
          }
          label="Withdraw"
          data-testid="ocash-overview-withdraw"
        />
        <IconButton
          className="token-overview__button"
          onClick={() => setActionModalState({ open: true, kind: 'transfer' })}
          Icon={
            <Icon
              name={IconName.Send}
              color={IconColor.iconAlternative}
              size={IconSize.Md}
            />
          }
          label="Transfer"
          data-testid="ocash-overview-transfer"
        />
        <IconButton
          className="token-overview__button"
          onClick={handleOpenReceiveAddress}
          Icon={
            <Icon
              name={IconName.Received}
              color={IconColor.iconAlternative}
              size={IconSize.Md}
            />
          }
          label={t('receive')}
          data-testid="ocash-overview-receive"
        />
      </Box>

      <ActionModal
        state={actionModalState}
        symbol={symbol}
        onClose={() => setActionModalState({ open: false })}
        onConfirm={handleConfirmAction}
        isSubmitting={isSubmitting}
      />

      {showUnlockModal ? (
        <Modal isOpen onClose={() => setShowUnlockModal(false)}>
          <ModalOverlay />
          <ModalContent>
            <ModalHeader onClose={() => setShowUnlockModal(false)}>
              解锁 OCash
            </ModalHeader>
            <ModalBody>
              <TextField
                value={unlockPassword}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setUnlockPassword(e.target.value)
                }
                type={TextFieldType.Password}
                placeholder="MetaMask Password"
                autoFocus
              />
            </ModalBody>
            <ModalFooter>
              <ButtonSecondary
                onClick={() => setShowUnlockModal(false)}
                disabled={isUnlocking}
              >
                Cancel
              </ButtonSecondary>
              <ButtonPrimary
                onClick={handleUnlock}
                disabled={isUnlocking}
              >
                {isUnlocking ? 'Unlocking...' : 'Confirm'}
              </ButtonPrimary>
            </ModalFooter>
          </ModalContent>
        </Modal>
      ) : null}

      {ocashReceiveAddress ? (
        <OcashReceiveModal
          address={ocashReceiveAddress}
          onClose={() => setOcashReceiveAddress(null)}
        />
      ) : null}

      {toastState ? (
        <ToastContainer>
          <Toast
            startAdornment={
              <Icon
                name={toastState.variant === 'error' ? IconName.Danger : IconName.Info}
                color={IconColor.iconAlternative}
              />
            }
            text={toastState.text}
            description={
              toastState.variant === 'error'
                ? '操作失败，请检查输入。'
                : '已同步到 OCash Activity。'
            }
            onClose={() => setToastState(null)}
            autoHideTime={2200}
            onAutoHideToast={() => setToastState(null)}
          />
        </ToastContainer>
      ) : null}

      {!selectedAddress ? (
        <Text
          variant={TextVariant.bodySm}
          color={TextColor.textAlternative}
          style={{ marginTop: 12, textAlign: 'center' }}
        >
          当前未选择账户，OCash 操作不可用。
        </Text>
      ) : !hasUnlockedSeed ? (
        <Text
          variant={TextVariant.bodySm}
          color={TextColor.textAlternative}
          style={{ marginTop: 12, textAlign: 'center' }}
        >
          首次使用请先解锁 OCash，后续操作无需再次输入密码。
        </Text>
      ) : null}
    </>
  );
};
