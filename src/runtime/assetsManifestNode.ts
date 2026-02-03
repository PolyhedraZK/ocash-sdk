import type { AssetsOverride } from '../types';
import type { SdkAssetsManifest } from './assetsManifest';
import { createAssetsOverrideFromManifest } from './assetsManifest';
import { SdkError } from '../errors';
import path from 'node:path';

const shardName = (index: number) => String(index).padStart(2, '0');

export const createAssetsOverrideFromManifestLocal = (manifest: SdkAssetsManifest, options?: { baseDir?: string }): AssetsOverride => {
  if (!manifest?.files || typeof manifest.files !== 'object') {
    throw new SdkError('CONFIG', 'Invalid assets manifest: missing files');
  }
  const baseDir = options?.baseDir ?? process.cwd();
  const out: AssetsOverride = {};
  for (const [logicalName, entry] of Object.entries(manifest.files)) {
    if (!entry || typeof entry !== 'object') continue;
    if (entry.type === 'single') {
      out[logicalName] = path.resolve(baseDir, entry.path);
      continue;
    }
    if (entry.type === 'split') {
      const count = Number(entry.count);
      if (!Number.isFinite(count) || count <= 0) {
        throw new SdkError('CONFIG', 'Invalid assets manifest: split entry missing count', { logicalName, entry });
      }
      out[logicalName] = Array.from({ length: count }, (_, i) => path.resolve(baseDir, entry.path, shardName(i)));
      continue;
    }
    throw new SdkError('CONFIG', 'Invalid assets manifest: unknown entry type', { logicalName, entry });
  }
  return out;
};
