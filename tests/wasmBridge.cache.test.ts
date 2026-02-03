import { describe, expect, it, vi } from 'vitest';
import { UniversalWasmBridge } from '../src/runtime/wasmBridge';

const ab = (text: string) => new TextEncoder().encode(text).buffer;

describe('UniversalWasmBridge (node) cache', () => {
  it('caches remote text/binary assets to disk when cacheDir is set', async () => {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const cacheDir = await fs.mkdtemp(path.join(process.env.TMPDIR || '/tmp', 'ocash-sdk-cache-'));

    const wasmExecUrl = 'https://cdn.example/wasm_exec.js';
    const wasmUrl = 'https://cdn.example/app.wasm';

    const fetchMock = vi
      .fn()
      .mockImplementationOnce(async () => ({ ok: true, status: 200, arrayBuffer: async () => ab('function Go(){ this.importObject={}; this.run=()=>{} }') }))
      .mockImplementationOnce(async () => ({ ok: true, status: 200, arrayBuffer: async () => ab('fake_wasm') }));

    vi.stubGlobal('fetch', fetchMock as any);

    const instantiateSpy = vi
      .spyOn(globalThis.WebAssembly, 'instantiate')
      .mockImplementation(async () => ({ instance: {} as any }) as any);

    // first run: fetch and save into cacheDir
    const bridge1 = new UniversalWasmBridge({
      runtime: 'node',
      cacheDir,
      assetsOverride: { 'wasm_exec.js': wasmExecUrl, 'app.wasm': wasmUrl },
    });
    await bridge1.init();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(instantiateSpy).toHaveBeenCalledTimes(1);

    // second run: simulate a new process and ensure cache hits (no fetch)
    // reset globals
    delete (globalThis as any).Go;
    fetchMock.mockClear();

    const bridge2 = new UniversalWasmBridge({
      runtime: 'node',
      cacheDir,
      assetsOverride: { 'wasm_exec.js': wasmExecUrl, 'app.wasm': wasmUrl },
    });
    await bridge2.init();
    expect(fetchMock).toHaveBeenCalledTimes(0);
  });
});

