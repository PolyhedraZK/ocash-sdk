import { afterEach, describe, expect, it, vi } from 'vitest';
import { UniversalWasmBridge } from '../src/runtime/wasmBridge';
import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('UniversalWasmBridge local assets', () => {
  it('loads a local file path in node runtime', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'ocash-sdk-assets-'));
    const filePath = path.join(dir, 'app.wasm');
    const payload = Buffer.from([1, 2, 3, 4]);
    await writeFile(filePath, payload);

    const bridge = new UniversalWasmBridge({
      runtime: 'node',
      assetsOverride: { 'app.wasm': filePath },
    });
    const buffer = await (bridge as any).fetchBinary('app.wasm');
    expect(Array.from(new Uint8Array(buffer))).toEqual([1, 2, 3, 4]);
  });

  it('loads a file:// URL in node runtime', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'ocash-sdk-assets-'));
    const filePath = path.join(dir, 'transfer.r1cs');
    const payload = Buffer.from([9, 8, 7]);
    await writeFile(filePath, payload);

    const bridge = new UniversalWasmBridge({
      runtime: 'node',
      assetsOverride: { 'transfer.r1cs': pathToFileURL(filePath).toString() },
    });
    const buffer = await (bridge as any).fetchBinary('transfer.r1cs');
    expect(Array.from(new Uint8Array(buffer))).toEqual([9, 8, 7]);
  });

  it('rejects file:// assets in browser runtime', async () => {
    vi.stubGlobal('window', { document: {}, location: { origin: 'https://example.com' } });
    const bridge = new UniversalWasmBridge({ runtime: 'browser', assetsOverride: { 'app.wasm': 'file:///tmp/app.wasm' } });
    await expect((bridge as any).fetchBinary('app.wasm')).rejects.toThrow(/file:\/\//i);
  });
});
