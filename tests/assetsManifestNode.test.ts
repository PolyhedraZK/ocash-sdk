import { describe, expect, it } from 'vitest';
import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { loadAssetsFromManifestSync } from '../src/runtime/assetsManifestNode';

describe('assets manifest node loader', () => {
  it('resolves local file paths from manifest', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'ocash-sdk-manifest-'));
    const manifestPath = path.join(dir, 'manifest.json');
    await writeFile(
      manifestPath,
      JSON.stringify({
        files: {
          'app.wasm': { type: 'single', path: 'app_aaaa.wasm', count: 1, sha256: '11'.repeat(32) },
          'transfer.pk': { type: 'split', path: 'transfer_pk_2_abcd', count: 2, sha256: '22'.repeat(32) },
        },
      }),
    );

    const loaded = loadAssetsFromManifestSync({ manifestPath });
    expect(loaded.assetsOverride['app.wasm']).toBe(path.resolve(dir, 'app_aaaa.wasm'));
    expect(loaded.assetsOverride['transfer.pk']).toEqual([
      path.resolve(dir, 'transfer_pk_2_abcd', '00'),
      path.resolve(dir, 'transfer_pk_2_abcd', '01'),
    ]);
    expect(loaded.assetsIntegrity['app.wasm']).toBe('11'.repeat(32));
  });
});
