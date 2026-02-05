import type { DemoController } from '../hooks/useDemoController';

export function EntryNullifiersPanel({
  nullifierRows,
  nullifierPage,
  nullifierTotal,
  nullifierLoading,
  setNullifierPage,
  refreshEntryNullifiers,
  walletOpened,
  sdk,
}: Pick<
  DemoController,
  | 'nullifierRows'
  | 'nullifierPage'
  | 'nullifierTotal'
  | 'nullifierLoading'
  | 'setNullifierPage'
  | 'refreshEntryNullifiers'
  | 'walletOpened'
  | 'sdk'
>) {
  const maxPage = Math.max(1, Math.ceil(nullifierTotal / 20));

  return (
    <section className="panel span-6">
      <div className="row">
        <h2>Entry Nullifiers</h2>
        <button className="secondary" onClick={refreshEntryNullifiers} disabled={!walletOpened || !sdk || nullifierLoading}>
          Refresh
        </button>
      </div>
      <div className="row">
        <button className="secondary" onClick={() => setNullifierPage(nullifierPage - 1)} disabled={nullifierPage <= 1 || nullifierLoading}>
          Prev
        </button>
        <button className="secondary" onClick={() => setNullifierPage(nullifierPage + 1)} disabled={nullifierPage >= maxPage || nullifierLoading}>
          Next
        </button>
        <span className="status">
          Page {nullifierPage}/{maxPage} (Total {nullifierTotal})
        </span>
      </div>
      <div className="list">
        {nullifierRows.length === 0 && <div className="notice">No nullifiers cached.</div>}
        {nullifierRows.map((row) => (
          <div key={`${row.chainId}-${row.nid}`} className="list-item">
            <div className="row">
              <strong>nid: {row.nid}</strong>
              <span className="mono">chain: {row.chainId}</span>
            </div>
            <div className="mono">nullifier: {row.nullifier}</div>
            {row.createdAt != null && <div className="status">createdAt: {row.createdAt}</div>}
          </div>
        ))}
      </div>
    </section>
  );
}
