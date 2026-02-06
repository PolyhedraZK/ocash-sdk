import { useMemo } from 'react';
import { useDemoStore } from '../state/demoStore';

export function ConfigPanel() {
  const { configText, sdkStatus } = useDemoStore();
  const statusLabel = useMemo(() => (sdkStatus === 'ready' ? 'Ready' : sdkStatus === 'loading' ? 'Loading' : sdkStatus === 'error' ? 'Error' : 'Idle'), [sdkStatus]);

  return (
    <section className="panel span-7">
      <div className="row">
        <div>
          <h2>Config</h2>
          <div className="label">SDK + Chain Settings</div>
        </div>
        <span className="badge">{statusLabel}</span>
      </div>
      <textarea value={configText} readOnly spellCheck={false} />
    </section>
  );
}
