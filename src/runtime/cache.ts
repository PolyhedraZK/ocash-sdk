export interface CacheControllerConfig {
  /** Base directory for persisted cache entries. */
  baseDir?: string;
  /** Enable or disable caching (disabled by default when no baseDir). */
  enable?: boolean;
}

/**
 * Small file-based cache for large binary assets (WASM, circuit files).
 * It is a best-effort cache: failures are swallowed to avoid breaking runtime.
 */
export class CacheController {
  private readonly baseDir: string;
  private readonly enabled: boolean;

  constructor(private readonly config: CacheControllerConfig = {}) {
    this.enabled = config.enable !== false && Boolean(config.baseDir);
    this.baseDir = config.baseDir ?? '';
  }

  /**
   * Resolve the on-disk path for a cache key.
   * Returns null when caching is disabled or path resolution fails.
   */
  private async resolvePath(key: string): Promise<string | null> {
    if (!this.enabled) return null;
    try {
      const path = await import('node:path');
      return path.resolve(this.baseDir, key);
    } catch {
      return null;
    }
  }

  /**
   * Load a cached payload if present and not expired.
   */
  async load(key: string, maxAgeMs?: number): Promise<ArrayBuffer | null> {
    if (!this.enabled) return null;
    try {
      const filePath = await this.resolvePath(key);
      if (!filePath) return null;
      const fs = await import('node:fs/promises');
      const meta = await fs.stat(filePath);
      if (maxAgeMs && Date.now() - meta.mtimeMs > maxAgeMs) {
        return null;
      }
      const buffer = await fs.readFile(filePath);
      return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    } catch {
      return null;
    }
  }

  /**
   * Persist a payload to disk. Errors are ignored to keep runtime resilient.
   */
  async save(key: string, payload: ArrayBuffer) {
    if (!this.enabled) return;
    try {
      const filePath = await this.resolvePath(key);
      if (!filePath) return;
      const [fs, path] = await Promise.all([import('node:fs/promises'), import('node:path')]);
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      const buffer = Buffer.from(payload);
      await fs.writeFile(filePath, buffer);
    } catch {
      // ignore cache failures
    }
  }
}
