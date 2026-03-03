import { useCallback, useState } from 'react';
import type { Hex } from '@ocash/sdk';
import { CryptoToolkit } from '@ocash/sdk/browser';
import { getWalletClient } from 'wagmi/actions';
import { useDemoStore } from '../store';
import { parseAmount, formatAmount } from '../format';

export function DepositPanel() {
  const { sdk, walletOpened, chainId, token, seed, accountNonce, address, isConnected, publicClient, walletClient, wagmiConfig, walletChainId, appendLog } = useDemoStore();
  const [amount, setAmount] = useState('0.01');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'waiting'>('idle');
  const [error, setError] = useState('');

  const handleDeposit = useCallback(async () => {
    if (!sdk || !token || !publicClient || !address) return;
    setError('');
    setStatus('submitting');
    try {
      const parsed = parseAmount(amount, token.decimals);
      const nonce = accountNonce != null ? String(accountNonce) : undefined;
      const pub = sdk.keys.getPublicKeyBySeed(seed, nonce);

      appendLog('deposit', 'Preparing deposit...');
      const prepared = await sdk.ops.prepareDeposit({
        chainId,
        assetId: token.id,
        amount: parsed,
        ownerPublicKey: pub,
        account: address,
        publicClient,
      });

      const commitment = CryptoToolkit.commitment(prepared.recordOpening, 'hex');
      appendLog('deposit', `Fee: ${formatAmount(prepared.protocolFee, token.decimals)} ${token.symbol}, Pay: ${formatAmount(prepared.payAmount, token.decimals)} ${token.symbol}`);

      const activeWalletClient = walletClient ?? (await getWalletClient(wagmiConfig, { chainId: walletChainId ?? undefined }).catch(() => undefined));
      if (!activeWalletClient?.writeContract) throw new Error('Wallet client not available');

      appendLog('deposit', 'Submitting on-chain...');
      const submit = await sdk.ops.submitDeposit({
        prepared,
        walletClient: activeWalletClient,
        publicClient,
        autoApprove: true,
      });

      setStatus('waiting');
      appendLog('deposit', `Tx: ${submit.txHash}`);

      const startedAt = Date.now();
      const commitmentLower = commitment.toLowerCase();
      while (Date.now() - startedAt < 120_000) {
        await sdk.sync.syncOnce({ chainIds: [chainId] });
        const result = await sdk.wallet.getUtxos({ chainId, assetId: token.id, includeSpent: true, offset: 0, limit: 50, orderBy: 'mkIndex', order: 'desc' });
        if (result.rows.some((row) => row.commitment.toLowerCase() === commitmentLower)) {
          appendLog('deposit', 'Deposit confirmed and indexed', 'info');
          setStatus('idle');
          return;
        }
        await new Promise((r) => setTimeout(r, 3000));
      }
      appendLog('deposit', 'Timed out waiting for commitment', 'warn');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      appendLog('deposit', err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setStatus('idle');
    }
  }, [sdk, token, chainId, seed, accountNonce, address, publicClient, walletClient, wagmiConfig, walletChainId, amount, appendLog]);

  const disabled = !sdk || !walletOpened || !isConnected || !token || status !== 'idle';

  return (
    <div className="card">
      <h2>Deposit</h2>
      <label>Amount ({token?.symbol ?? 'ETH'})</label>
      <div className="row">
        <input type="text" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <button onClick={handleDeposit} disabled={disabled}>
          {status === 'waiting' ? 'Waiting...' : status === 'submitting' ? 'Depositing...' : 'Deposit'}
        </button>
      </div>
      {error && <div className="status error">{error}</div>}
    </div>
  );
}
