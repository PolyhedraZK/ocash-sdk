import type { DemoController } from '../hooks/useDemoController';

export function ConfigPanel({ configText, statusLabel }: Pick<DemoController, 'configText' | 'statusLabel'>) {
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
