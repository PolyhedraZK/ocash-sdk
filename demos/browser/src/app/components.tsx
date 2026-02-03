import type { FeeRow } from './constants';

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
      <button onClick={onSubmit} disabled={disabled}>
        Deposit
      </button>
      <FeePanel rows={feeRows} loading={feeLoading} error={feeError} />
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
  feeRows,
  feeLoading,
  feeError,
  feeOk,
  feeOkWithMerge,
  notice,
}: {
  amount: string;
  to: string;
  onAmountChange: (value: string) => void;
  onToChange: (value: string) => void;
  onMax: () => void;
  onSubmit: () => void;
  disabled: boolean;
  feeRows: FeeRow[];
  feeLoading: boolean;
  feeError: string;
  feeOk?: boolean;
  feeOkWithMerge?: boolean;
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
      <label className="label">Recipient (Viewing Address)</label>
      <input value={to} onChange={(event) => onToChange(event.target.value)} placeholder="0x..." />
      <button onClick={onSubmit} disabled={disabled}>
        Transfer
      </button>
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
  feeRows,
  feeLoading,
  feeError,
  feeOk,
  feeOkWithMerge,
  notice,
}: {
  amount: string;
  recipient: string;
  onAmountChange: (value: string) => void;
  onRecipientChange: (value: string) => void;
  onMax: () => void;
  onSubmit: () => void;
  disabled: boolean;
  feeRows: FeeRow[];
  feeLoading: boolean;
  feeError: string;
  feeOk?: boolean;
  feeOkWithMerge?: boolean;
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
      <label className="label">Recipient (EVM Address)</label>
      <input value={recipient} onChange={(event) => onRecipientChange(event.target.value)} placeholder="0x..." />
      <button onClick={onSubmit} disabled={disabled}>
        Withdraw
      </button>
      <FeePanel rows={feeRows} loading={feeLoading} error={feeError} ok={feeOk} okWithMerge={feeOkWithMerge} />
    </div>
  );
}
