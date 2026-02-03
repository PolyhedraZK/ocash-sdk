export interface CacheControllerConfig {
  baseDir?: string;
  enable?: boolean;
}

export class CacheController {
  private readonly baseDir: string;
  private readonly enabled: boolean;

  constructor(private readonly config: CacheControllerConfig = {}) {
    this.enabled = config.enable !== false && Boolean(config.baseDir);
    this.baseDir = config.baseDir ?? '';
  }

  private async resolvePath(key: string): Promise<string | null> {
    if (!this.enabled) return null;
    try {
      const path = await import('node:path');
      return path.resolve(this.baseDir, key);
    } catch {
      return null;
    }
  }

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
