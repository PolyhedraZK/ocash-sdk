import type { DemoController } from '../hooks/useDemoController';

function formatTimestamp(value: number) {
  const millis = value < 1_000_000_000_000 ? value * 1000 : value;
  return new Date(millis).toLocaleString();
}

export function EntryMemosPanel({
  memoRows,
  memoPage,
  memoTotal,
  memoLoading,
  setMemoPage,
  refreshEntryMemos,
  walletOpened,
  sdk,
}: Pick<
  DemoController,
  'memoRows' | 'memoPage' | 'memoTotal' | 'memoLoading' | 'setMemoPage' | 'refreshEntryMemos' | 'walletOpened' | 'sdk'
>) {
  const maxPage = Math.max(1, Math.ceil(memoTotal / 20));

  return (
    <section className="panel span-6">
      <div className="row">
        <h2>Entry Memos</h2>
        <button className="secondary" onClick={refreshEntryMemos} disabled={!walletOpened || !sdk || memoLoading}>
          Refresh
        </button>
      </div>
      <div className="row">
        <button className="secondary" onClick={() => setMemoPage(memoPage - 1)} disabled={memoPage <= 1 || memoLoading}>
          Prev
        </button>
        <button className="secondary" onClick={() => setMemoPage(memoPage + 1)} disabled={memoPage >= maxPage || memoLoading}>
          Next
        </button>
        <span className="status">
          Page {memoPage}/{maxPage} (Total {memoTotal})
        </span>
      </div>
      <div className="list">
        {memoRows.length === 0 && <div className="notice">No memos cached.</div>}
        {memoRows.map((row) => (
          <div key={`${row.chainId}-${row.cid}`} className="list-item">
            <div className="row">
              <strong>cid: {row.cid}</strong>
              <span className="mono">chain: {row.chainId}</span>
            </div>
            <div className="mono">commitment: {row.commitment}</div>
            <div className="mono">memo: {row.memo}</div>
            {row.createdAt != null && <div className="status">createdAt: {formatTimestamp(row.createdAt)}</div>}
          </div>
        ))}
      </div>
    </section>
  );
}
