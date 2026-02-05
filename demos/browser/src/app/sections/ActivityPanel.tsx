import type { DemoController } from '../hooks/useDemoController';

export function ActivityPanel({ actionMessage, logs }: Pick<DemoController, 'actionMessage' | 'logs'>) {
  return (
    <section className="panel span-6">
      <h2>Activity</h2>
      {actionMessage && <div className="notice">{actionMessage}</div>}
      <div className="list">
        {logs.length === 0 && <div className="notice">No logs yet.</div>}
        {logs.map((entry, idx) => (
          <div key={`${entry.time}-${idx}`} className="list-item">
            <div className="row">
              <strong>{entry.label}</strong>
              <span className="mono">{entry.time}</span>
            </div>
            <div className="mono">{entry.message}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
