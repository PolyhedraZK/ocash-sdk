import { afterEach, describe, expect, it, vi } from 'vitest';
import { UniversalWasmBridge } from '../src/runtime/wasmBridge';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('UniversalWasmBridge runtime detection', () => {
  it('defaults to node in a node environment', () => {
    const bridge = new UniversalWasmBridge();
    expect((bridge as any).runtime).toBe('node');
  });

  it('detects browser when window.document exists', () => {
    vi.stubGlobal('window', { document: {} });
    const bridge = new UniversalWasmBridge();
    expect((bridge as any).runtime).toBe('browser');
  });

  it('respects runtime=browser', () => {
    const bridge = new UniversalWasmBridge({ runtime: 'browser' });
    expect((bridge as any).runtime).toBe('browser');
  });

  it('respects runtime=hybrid', () => {
    const bridge = new UniversalWasmBridge({ runtime: 'hybrid' });
    expect((bridge as any).runtime).toBe('hybrid');
  });
});

describe('UniversalWasmBridge asset source resolution', () => {
  it('resolves relative URLs from globalThis.location.origin in browser runtime (workers)', async () => {
    vi.stubGlobal('location', { origin: 'https://example.com' });
    const bridge = new UniversalWasmBridge({ runtime: 'browser' });
    const source = await (bridge as any).resolveAssetSource('/assets/app.wasm');
    expect(source).toEqual({ kind: 'url', url: 'https://example.com/assets/app.wasm' });
  });
});
