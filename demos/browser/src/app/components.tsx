import type { FeeRow } from './constants';

export type UtxoPreviewRow = {
  cid: string;
  amount: string;
};

export function FeePanel({ rows, loading, error, ok, okWithMerge }: { rows: FeeRow[]; loading: boolean; error: string; ok?: boolean; okWithMerge?: boolean }) {
  return (
    <div className="stack">
      {loading && <div className="notice">Estimating fees...</div>}
      {error && <div className="notice">{error}</div>}
      {ok === false && <div className="notice">Insufficient balance for this amount.</div>}
      {okWithMerge === true && ok === false && <div className="notice">Merge required: transfer will need a merge step.</div>}
      <div className="list">
        {rows.length === 0 ? <div className="notice">No fee data yet.</div> : null}
        {rows.map((row) => (
          <div key={row.label} className="list-item">
            <div className="row">
              <strong>{row.label}</strong>
              <span className="mono">{row.value}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function DepositForm({
  amount,
  onAmountChange,
  onMax,
  onSubmit,
  disabled,
  submitting,
  submitLabel,
  feeRows,
  feeLoading,
  feeError,
  notice,
}: {
  amount: string;
  onAmountChange: (value: string) => void;
  onMax: () => void;
  onSubmit: () => void;
  disabled: boolean;
  submitting?: boolean;
  submitLabel?: string;
  feeRows: FeeRow[];
  feeLoading: boolean;
  feeError: string;
  notice?: string;
}) {
  return (
    <div className="stack">
      {notice ? <div className="notice">{notice}</div> : null}
      <label className="label">Amount</label>
      <div className="row">
        <input value={amount} onChange={(event) => onAmountChange(event.target.value)} placeholder="0.0" />
        <button className="secondary" type="button" onClick={onMax} disabled={disabled}>
          Max
        </button>
      </div>
      <button onClick={onSubmit} disabled={disabled || submitting}>
        {submitLabel ?? (submitting ? 'Depositing...' : 'Deposit')}
      </button>
      <FeePanel rows={feeRows} loading={feeLoading} error={feeError} />
    </div>
  );
}

export function UtxoPreview({ rows }: { rows: UtxoPreviewRow[] }) {
  if (rows.length === 0) return null;
  return (
    <div className="stack">
      <label className="label">Selected UTXOs</label>
      <div className="list">
        {rows.map((row) => (
          <div key={row.cid} className="list-item">
            <div className="row">
              <strong>cid</strong>
              <span className="mono">{row.cid}</span>
            </div>
            <div className="row">
              <strong>amount</strong>
              <span className="mono">{row.amount}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function TransferForm({
  amount,
  to,
  onAmountChange,
  onToChange,
  onMax,
  onSubmit,
  disabled,
  submitting,
  submitLabel,
  progressText,
  feeRows,
  feeLoading,
  feeError,
  feeOk,
  feeOkWithMerge,
  notice,
  utxoRows,
}: {
  amount: string;
  to: string;
  onAmountChange: (value: string) => void;
  onToChange: (value: string) => void;
  onMax: () => void;
  onSubmit: () => void;
  disabled: boolean;
  submitting?: boolean;
  submitLabel?: string;
  progressText?: string;
  feeRows: FeeRow[];
  feeLoading: boolean;
  feeError: string;
  feeOk?: boolean;
  feeOkWithMerge?: boolean;
  notice?: string;
  utxoRows?: UtxoPreviewRow[];
}) {
  return (
    <div className="stack">
      {notice ? <div className="notice">{notice}</div> : null}
      <label className="label">Amount</label>
      <div className="row">
        <input value={amount} onChange={(event) => onAmountChange(event.target.value)} placeholder="0.0" />
        <button className="secondary" type="button" onClick={onMax} disabled={disabled}>
          Max
        </button>
      </div>
      <label className="label">Recipient (Viewing Address)</label>
      <input value={to} onChange={(event) => onToChange(event.target.value)} placeholder="0x..." />
      <button onClick={onSubmit} disabled={disabled || submitting}>
        {submitLabel ?? (submitting ? 'Transferring...' : 'Transfer')}
      </button>
      {progressText ? <div className="status">{progressText}</div> : null}
      {utxoRows ? <UtxoPreview rows={utxoRows} /> : null}
      <FeePanel rows={feeRows} loading={feeLoading} error={feeError} ok={feeOk} okWithMerge={feeOkWithMerge} />
    </div>
  );
}

export function WithdrawForm({
  amount,
  recipient,
  onAmountChange,
  onRecipientChange,
  onMax,
  onSubmit,
  disabled,
  submitting,
  submitLabel,
  progressText,
  feeRows,
  feeLoading,
  feeError,
  feeOk,
  feeOkWithMerge,
  notice,
  utxoRows,
}: {
  amount: string;
  recipient: string;
  onAmountChange: (value: string) => void;
  onRecipientChange: (value: string) => void;
  onMax: () => void;
  onSubmit: () => void;
  disabled: boolean;
  submitting?: boolean;
  submitLabel?: string;
  progressText?: string;
  feeRows: FeeRow[];
  feeLoading: boolean;
  feeError: string;
  feeOk?: boolean;
  feeOkWithMerge?: boolean;
  notice?: string;
  utxoRows?: UtxoPreviewRow[];
}) {
  return (
    <div className="stack">
      {notice ? <div className="notice">{notice}</div> : null}
      <label className="label">Amount</label>
      <div className="row">
        <input value={amount} onChange={(event) => onAmountChange(event.target.value)} placeholder="0.0" />
        <button className="secondary" type="button" onClick={onMax} disabled={disabled}>
          Max
        </button>
      </div>
      <label className="label">Recipient (EVM Address)</label>
      <input value={recipient} onChange={(event) => onRecipientChange(event.target.value)} placeholder="0x..." />
      <button onClick={onSubmit} disabled={disabled || submitting}>
        {submitLabel ?? (submitting ? 'Withdrawing...' : 'Withdraw')}
      </button>
      {progressText ? <div className="status">{progressText}</div> : null}
      {utxoRows ? <UtxoPreview rows={utxoRows} /> : null}
      <FeePanel rows={feeRows} loading={feeLoading} error={feeError} ok={feeOk} okWithMerge={feeOkWithMerge} />
    </div>
  );
}
