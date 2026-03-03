import { useCallback, useState } from 'react';
import type { Hex } from '@ocash/sdk';
import { getAddress, isAddress } from 'viem';
import { useDemoStore } from '../store';
import { parseAmount } from '../format';

export function WithdrawPanel() {
  const { sdk, walletOpened, chainId, token, seed, accountNonce, publicClient, address, appendLog } = useDemoStore();
  const [amount, setAmount] = useState('0.01');
  const [recipient, setRecipient] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');

  const handleWithdraw = useCallback(async () => {
    if (!sdk || !token || !publicClient) return;
    const dest = recipient || address || '';
    if (!isAddress(dest)) {
      setError('Recipient must be a valid EVM address');
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      setProgress('Syncing...');
      await sdk.sync.syncOnce({ chainIds: [chainId] });

      setProgress('Building proof...');
      const parsed = parseAmount(amount, token.decimals);
      const nonce = accountNonce != null ? String(accountNonce) : undefined;
      const owner = sdk.keys.deriveKeyPair(seed, nonce);
      const prepared = await sdk.ops.prepareWithdraw({
        chainId,
        assetId: token.id,
        amount: parsed,
        recipient: getAddress(dest),
        ownerKeyPair: owner,
        publicClient,
      });

      setProgress('Submitting to relayer...');
      appendLog('withdraw', 'Submitting withdrawal...');
      const submit = await sdk.ops.submitRelayerRequest<Hex>({ prepared, publicClient });

      setProgress('Waiting for receipt...');
      await submit.transactionReceipt;
      appendLog('withdraw', 'Withdrawal confirmed', 'info');
      setProgress('');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      appendLog('withdraw', err instanceof Error ? err.message : String(err), 'error');
      setProgress('');
    } finally {
      setSubmitting(false);
    }
  }, [sdk, token, chainId, seed, accountNonce, publicClient, recipient, address, amount, appendLog]);

  const disabled = !sdk || !walletOpened || !token || submitting;

  return (
    <div className="card">
      <h2>Withdraw</h2>
      <label>Recipient (EVM address)</label>
      <input type="text" value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder={address ?? '0x...'} />
      <label style={{ marginTop: 8 }}>Amount ({token?.symbol ?? 'ETH'})</label>
      <div className="row">
        <input type="text" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <button onClick={handleWithdraw} disabled={disabled}>
          {submitting ? 'Withdrawing...' : 'Withdraw'}
        </button>
      </div>
      {progress && <div className="status">{progress}</div>}
      {error && <div className="status error">{error}</div>}
    </div>
  );
}
