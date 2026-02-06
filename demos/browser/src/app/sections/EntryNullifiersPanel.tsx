import { useCallback, useEffect, useState } from 'react';
import type { EntryNullifierRecord, StorageAdapter } from '@ocash/sdk';
import { message } from 'antd';
import { useDemoStore } from '../state/demoStore';

const NULLIFIER_PAGE_SIZE = 20;

export function EntryNullifiersPanel() {
  const { sdk, walletOpened, currentChain } = useDemoStore();
  const [nullifierRows, setNullifierRows] = useState<EntryNullifierRecord[]>([]);
  const [nullifierPage, setNullifierPage] = useState(1);
  const [nullifierTotal, setNullifierTotal] = useState(0);
  const [nullifierLoading, setNullifierLoading] = useState(false);

  useEffect(() => {
    setNullifierPage(1);
  }, [currentChain?.chainId]);

  const refreshEntryNullifiers = useCallback(async () => {
    if (!sdk || !currentChain || !walletOpened) {
      setNullifierRows([]);
      setNullifierTotal(0);
      return;
    }
    const store = sdk.storage.getAdapter() as StorageAdapter;
    if (!store.listEntryNullifiers) {
      setNullifierRows([]);
      setNullifierTotal(0);
      return;
    }
    setNullifierLoading(true);
    try {
      const offset = (nullifierPage - 1) * NULLIFIER_PAGE_SIZE;
      const result = await store.listEntryNullifiers({
        chainId: currentChain.chainId,
        offset,
        limit: NULLIFIER_PAGE_SIZE,
        orderBy: 'nid',
        order: 'desc',
      });
      const total = result.total;
      const maxPage = Math.max(1, Math.ceil(total / NULLIFIER_PAGE_SIZE));
      if (nullifierPage > maxPage) {
        setNullifierPage(maxPage);
        setNullifierRows([]);
        setNullifierTotal(total);
        return;
      }
      setNullifierRows(result.rows);
      setNullifierTotal(total);
    } catch (error) {
      message.error(error instanceof Error ? error.message : String(error));
    } finally {
      setNullifierLoading(false);
    }
  }, [sdk, currentChain, walletOpened, nullifierPage]);

  useEffect(() => {
    void refreshEntryNullifiers();
  }, [refreshEntryNullifiers]);

  const maxPage = Math.max(1, Math.ceil(nullifierTotal / NULLIFIER_PAGE_SIZE));

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
