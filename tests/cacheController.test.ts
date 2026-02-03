import { describe, expect, it } from 'vitest';
import { CacheController } from '../src/runtime/cache';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('CacheController', () => {
  it('save/load roundtrip when enabled', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ocash-sdk-cache-'));
    const cache = new CacheController({ baseDir: dir, enable: true });
    const payload = new Uint8Array([1, 2, 3, 4]).buffer;
    await cache.save('a/b.bin', payload);
    const loaded = await cache.load('a/b.bin');
    expect(loaded).not.toBeNull();
    expect(Array.from(new Uint8Array(loaded!))).toEqual([1, 2, 3, 4]);
  });

  it('does nothing when disabled', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ocash-sdk-cache-'));
    const cache = new CacheController({ baseDir: dir, enable: false });
    await cache.save('x.bin', new Uint8Array([9]).buffer);
    await expect(cache.load('x.bin')).resolves.toBeNull();
  });
});

