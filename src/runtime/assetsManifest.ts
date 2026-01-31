import type { AssetsIntegrity, AssetsOverride } from '../types';
import { SdkError } from '../errors';

export type SdkAssetManifestEntry =
  | {
      type: 'single';
      path: string;
      count: 1;
      size?: number;
      hash?: string;
      sha256?: string;
      extension?: string;
    }
  | {
      type: 'split';
      path: string;
      count: number;
      size?: number;
      hash?: string;
      sha256?: string;
      extension?: string;
    };

export type SdkAssetsManifest = {
  generated_at?: string;
  metadata?: Record<string, unknown>;
  files: Record<string, SdkAssetManifestEntry>;
};

const joinUrl = (baseUrl: string | undefined, path: string) => {
  if (!baseUrl) return path;
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  const next = path.startsWith('/') ? path.slice(1) : path;
  return `${base}${next}`;
};

const shardName = (index: number) => String(index).padStart(2, '0');

export const createAssetsOverrideFromManifest = (manifest: SdkAssetsManifest, options?: { baseUrl?: string }): AssetsOverride => {
  if (!manifest?.files || typeof manifest.files !== 'object') {
    throw new SdkError('CONFIG', 'Invalid assets manifest: missing files');
  }
  const out: AssetsOverride = {};
  for (const [logicalName, entry] of Object.entries(manifest.files)) {
    if (!entry || typeof entry !== 'object') continue;
    if (entry.type === 'single') {
      out[logicalName] = joinUrl(options?.baseUrl, entry.path);
      continue;
    }
    if (entry.type === 'split') {
      const count = Number(entry.count);
      if (!Number.isFinite(count) || count <= 0) {
        throw new SdkError('CONFIG', 'Invalid assets manifest: split entry missing count', { logicalName, entry });
      }
      out[logicalName] = Array.from({ length: count }, (_, i) => joinUrl(options?.baseUrl, `${entry.path}/${shardName(i)}`));
      continue;
    }
    throw new SdkError('CONFIG', 'Invalid assets manifest: unknown entry type', { logicalName, entry });
  }
  return out;
};

export const createAssetsIntegrityFromManifest = (manifest: SdkAssetsManifest): AssetsIntegrity => {
  if (!manifest?.files || typeof manifest.files !== 'object') {
    throw new SdkError('CONFIG', 'Invalid assets manifest: missing files');
  }
  const out: AssetsIntegrity = {};
  for (const [logicalName, entry] of Object.entries(manifest.files)) {
    const sha256 = (entry as any)?.sha256;
    if (typeof sha256 === 'string' && sha256.length) {
      out[logicalName] = sha256;
    }
  }
  return out;
};

export const loadAssetsFromManifestUrl = async (input: {
  manifestUrl: string;
  baseUrl?: string;
}): Promise<{ manifest: SdkAssetsManifest; assetsOverride: AssetsOverride; assetsIntegrity: AssetsIntegrity }> => {
  if (!input?.manifestUrl || typeof input.manifestUrl !== 'string') {
    throw new SdkError('CONFIG', 'Missing manifestUrl');
  }
  const response = await fetch(input.manifestUrl);
  if (!response.ok) {
    throw new SdkError('ASSETS', `Failed to load assets manifest: ${input.manifestUrl} (${response.status})`, {
      url: input.manifestUrl,
      status: response.status,
    });
  }
  const manifest = (await response.json()) as SdkAssetsManifest;
  const baseUrl = input.baseUrl ?? new URL('.', input.manifestUrl).toString();
  const assetsOverride = createAssetsOverrideFromManifest(manifest, { baseUrl });
  const assetsIntegrity = createAssetsIntegrityFromManifest(manifest);
  return { manifest, assetsOverride, assetsIntegrity };
};
