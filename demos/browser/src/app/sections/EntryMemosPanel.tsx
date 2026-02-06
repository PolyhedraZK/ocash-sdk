import { useCallback, useEffect, useState } from 'react';
import type { EntryMemoRecord, StorageAdapter } from '@ocash/sdk';
import { message } from 'antd';
import { useDemoStore } from '../state/demoStore';

const MEMO_PAGE_SIZE = 20;

function formatTimestamp(value: number) {
  const millis = value < 1_000_000_000_000 ? value * 1000 : value;
  return new Date(millis).toLocaleString();
}

export function EntryMemosPanel() {
  const { sdk, walletOpened, currentChain } = useDemoStore();
  const [memoRows, setMemoRows] = useState<EntryMemoRecord[]>([]);
  const [memoPage, setMemoPage] = useState(1);
  const [memoTotal, setMemoTotal] = useState(0);
  const [memoLoading, setMemoLoading] = useState(false);

  useEffect(() => {
    setMemoPage(1);
  }, [currentChain?.chainId]);

  const refreshEntryMemos = useCallback(async () => {
    if (!sdk || !currentChain || !walletOpened) {
      setMemoRows([]);
      setMemoTotal(0);
      return;
    }
    const store = sdk.storage.getAdapter() as StorageAdapter;
    if (!store.listEntryMemos) {
      setMemoRows([]);
      setMemoTotal(0);
      return;
    }
    setMemoLoading(true);
    try {
      const offset = (memoPage - 1) * MEMO_PAGE_SIZE;
      const result = await store.listEntryMemos({
        chainId: currentChain.chainId,
        offset,
        limit: MEMO_PAGE_SIZE,
        orderBy: 'cid',
        order: 'desc',
      });
      const total = result.total;
      const maxPage = Math.max(1, Math.ceil(total / MEMO_PAGE_SIZE));
      if (memoPage > maxPage) {
        setMemoPage(maxPage);
        setMemoRows([]);
        setMemoTotal(total);
        return;
      }
      setMemoRows(result.rows);
      setMemoTotal(total);
    } catch (error) {
      message.error(error instanceof Error ? error.message : String(error));
    } finally {
      setMemoLoading(false);
    }
  }, [sdk, currentChain, walletOpened, memoPage]);

  useEffect(() => {
    void refreshEntryMemos();
  }, [refreshEntryMemos]);

  const maxPage = Math.max(1, Math.ceil(memoTotal / MEMO_PAGE_SIZE));

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
