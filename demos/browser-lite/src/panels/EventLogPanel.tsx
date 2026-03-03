import { useDemoStore } from '../store';

export function EventLogPanel() {
  const { log, clearLog } = useDemoStore();

  return (
    <div className="card">
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
        <h2>Event Log</h2>
        <button className="secondary" onClick={clearLog} disabled={log.length === 0}>Clear</button>
      </div>
      <div className="event-log">
        {log.length === 0 && <div style={{ color: 'var(--text-muted)' }}>No events yet.</div>}
        {log.map((entry, i) => (
          <div key={i} className={`entry ${entry.level}`}>
            <span className="time">{entry.time}</span>
            <span className="label">[{entry.label}]</span>
            <span>{entry.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
