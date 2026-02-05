import type { DemoController } from '../hooks/useDemoController';

export function OperationsPanel({ operations }: Pick<DemoController, 'operations'>) {
  return (
    <section className="panel span-6">
      <h2>Operations</h2>
      <div className="list">
        {operations.length === 0 && <div className="notice">No operations yet.</div>}
        {operations.map((op) => (
          <div key={op.id} className="list-item">
            <div className="row">
              <strong>{op.type}</strong>
              <span className="badge">{op.status}</span>
            </div>
            <div className="mono">token: {op.tokenId}</div>
            <div className="mono">created: {new Date(op.createdAt).toLocaleString()}</div>
            {op.txHash && <div className="mono">txHash: {op.txHash}</div>}
            {op.relayerTxHash && <div className="mono">relayerTx: {op.relayerTxHash}</div>}
          </div>
        ))}
      </div>
    </section>
  );
}
