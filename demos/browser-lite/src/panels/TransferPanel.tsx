import { useCallback, useState } from 'react';
import type { Hex } from '@ocash/sdk';
import { useDemoStore } from '../store';
import { parseAmount } from '../format';

export function TransferPanel() {
  const { sdk, walletOpened, chainId, token, seed, accountNonce, publicClient, viewingAddress, appendLog } = useDemoStore();
  const [amount, setAmount] = useState('0.01');
  const [to, setTo] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');

  const handleTransfer = useCallback(async () => {
    if (!sdk || !token || !publicClient) return;
    const recipient = (to || viewingAddress || '') as Hex;
    if (!/^0x[0-9a-fA-F]{64}$/.test(recipient)) {
      setError('Recipient must be a 32-byte viewing address');
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
      const prepared = await sdk.ops.prepareTransfer({
        chainId,
        assetId: token.id,
        amount: parsed,
        to: recipient,
        ownerKeyPair: owner,
        publicClient,
        autoMerge: true,
      });

      if (prepared.kind === 'merge') {
        appendLog('transfer', 'Merge required. Submitting merge first...', 'warn');
        const mergeSubmit = await sdk.ops.submitRelayerRequest<Hex>({ prepared: prepared.merge, publicClient });
        appendLog('transfer', 'Waiting for merge receipt...');
        await mergeSubmit.transactionReceipt;
        appendLog('transfer', 'Merge confirmed. Please retry transfer.', 'info');
        setSubmitting(false);
        setProgress('');
        return;
      }

      setProgress('Submitting to relayer...');
      appendLog('transfer', 'Submitting transfer...');
      const submit = await sdk.ops.submitRelayerRequest<Hex>({ prepared, publicClient });

      setProgress('Waiting for receipt...');
      await submit.transactionReceipt;
      appendLog('transfer', 'Transfer confirmed', 'info');
      setProgress('');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      appendLog('transfer', err instanceof Error ? err.message : String(err), 'error');
      setProgress('');
    } finally {
      setSubmitting(false);
    }
  }, [sdk, token, chainId, seed, accountNonce, publicClient, to, viewingAddress, amount, appendLog]);

  const disabled = !sdk || !walletOpened || !token || submitting;

  return (
    <div className="card">
      <h2>Transfer</h2>
      <label>Recipient (viewing address)</label>
      <input type="text" value={to} onChange={(e) => setTo(e.target.value)} placeholder={viewingAddress ?? '0x...'} />
      <label style={{ marginTop: 8 }}>Amount ({token?.symbol ?? 'ETH'})</label>
      <div className="row">
        <input type="text" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <button onClick={handleTransfer} disabled={disabled}>
          {submitting ? 'Transferring...' : 'Transfer'}
        </button>
      </div>
      {progress && <div className="status">{progress}</div>}
      {error && <div className="status error">{error}</div>}
    </div>
  );
}
