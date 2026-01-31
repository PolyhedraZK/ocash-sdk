import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createAssetsIntegrityFromManifest,
  createAssetsOverrideFromManifest,
  loadAssetsFromManifestUrl,
  type SdkAssetsManifest,
} from '../src/runtime/assetsManifest';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('assets manifest helpers', () => {
  it('builds URL overrides for single/split entries', () => {
    const manifest: SdkAssetsManifest = {
      files: {
        'app.wasm': { type: 'single', path: 'app_aaaa.wasm', count: 1, sha256: '11'.repeat(32) },
        'transfer.pk': { type: 'split', path: 'transfer_pk_2_abcd', count: 2, sha256: '22'.repeat(32) },
      },
    };
    const override = createAssetsOverrideFromManifest(manifest, { baseUrl: 'https://cdn.example.com/ocash' });
    expect(override['app.wasm']).toBe('https://cdn.example.com/ocash/app_aaaa.wasm');
    expect(override['transfer.pk']).toEqual([
      'https://cdn.example.com/ocash/transfer_pk_2_abcd/00',
      'https://cdn.example.com/ocash/transfer_pk_2_abcd/01',
    ]);

    const integrity = createAssetsIntegrityFromManifest(manifest);
    expect(integrity).toEqual({ 'app.wasm': '11'.repeat(32), 'transfer.pk': '22'.repeat(32) });
  });

  it('loads manifest from URL and derives overrides/integrity', async () => {
    const manifest: SdkAssetsManifest = {
      files: {
        'app.wasm': { type: 'single', path: 'app_aaaa.wasm', count: 1, sha256: '11'.repeat(32) },
      },
    };

    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => manifest })) as any);

    const loaded = await loadAssetsFromManifestUrl({ manifestUrl: 'https://cdn.example.com/ocash/manifest.json' });
    expect(loaded.assetsOverride['app.wasm']).toBe('https://cdn.example.com/ocash/app_aaaa.wasm');
    expect(loaded.assetsIntegrity['app.wasm']).toBe('11'.repeat(32));
  });
});
