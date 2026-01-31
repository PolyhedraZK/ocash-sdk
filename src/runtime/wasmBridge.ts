import type { CommitmentData, InputSecret, ProofBridge, AssetOverrideEntry, AssetsOverride, AssetsIntegrity, OCashSdkConfig } from '../types';
import { MemoKit } from '../memo/memoKit';
import { CryptoToolkit } from '../crypto/cryptoToolkit';
import { toCommitmentData } from '../crypto/records';
import { CacheController } from './cache';
import { SdkError } from '../errors';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils';

const arrayBufferToHex = (buffer: ArrayBuffer): string => {
  const view = new Uint8Array(buffer);
  return Array.from(view, (byte) => byte.toString(16).padStart(2, '0')).join('');
};

export interface WasmBridgeConfig {
  assetsOverride?: AssetsOverride;
  assetsIntegrity?: AssetsIntegrity;
  cacheDir?: string;
  runtime?: 'auto' | 'browser' | 'node' | 'hybrid';
}

const getGlobal = <T = any>(key: string): T | undefined => (globalThis as any)[key];

type AssetSource = { kind: 'url'; url: string } | { kind: 'file'; filePath: string };

const fileUrlToPathCompat = (url: string): string => {
  const u = new URL(url);
  if (u.protocol !== 'file:') {
    throw new SdkError('CONFIG', 'Only file:// URLs are supported for local assets', { url });
  }
  let pathname = decodeURIComponent(u.pathname);
  // On Windows `file:///C:/...` becomes `/C:/...` in URL.pathname
  if (/^\/[a-zA-Z]:\//.test(pathname)) pathname = pathname.slice(1);
  return pathname;
};

export class UniversalWasmBridge implements ProofBridge {
  private goInstance: any | null = null;
  private initialized = false;
  private transferReady = false;
  private withdrawReady = false;
  private readonly cache: CacheController;
  private readonly runtime: 'browser' | 'node' | 'hybrid';
  private readonly textDecoder = new TextDecoder();

  constructor(private readonly config: WasmBridgeConfig = {}) {
    this.runtime = this.detectRuntime(config.runtime);
    this.cache = new CacheController({ baseDir: config.cacheDir, enable: this.runtime !== 'browser' });
  }

  private detectRuntime(preferred?: OCashSdkConfig['runtime']): 'browser' | 'node' | 'hybrid' {
    if (preferred === 'browser') return 'browser';
    if (preferred === 'node') return 'node';
    if (preferred === 'hybrid') return 'hybrid';
    if (typeof window !== 'undefined' && typeof window.document !== 'undefined') return 'browser';
    // Workers (no `window.document`) still behave like browsers.
    if (typeof globalThis.location !== 'undefined') return 'browser';
    if (typeof process !== 'undefined' && Boolean((process as any)?.versions?.node)) return 'node';
    return 'browser';
  }

  private cacheKey(url: string) {
    return url.replace(/^[a-z]+:\/\//i, '').replace(/[^a-zA-Z0-9._-]/g, '_');
  }

  private async fetchBinary(filename: string): Promise<ArrayBuffer> {
    const override = this.config.assetsOverride?.[filename];
    if (!override) {
      throw new SdkError('ASSETS', `Missing assetsOverride for ${filename}`, { filename });
    }
    const buffer = await this.fetchOverride(filename, override);
    this.verifyIntegrity(filename, buffer);
    return buffer;
  }

  private async fetchOverride(key: string, override: AssetOverrideEntry): Promise<ArrayBuffer> {
    if (typeof override === 'string') {
      return this.fetchSourceCached(key, await this.resolveAssetSource(override));
    }
    if (Array.isArray(override)) {
      return this.fetchShards(key, override);
    }
    throw new SdkError('ASSETS', 'Unknown asset override format', { key, overrideType: typeof override });
  }

  private async resolveAssetSource(pathOrUrl: string): Promise<AssetSource> {
    if (/^https?:\/\//i.test(pathOrUrl)) return { kind: 'url', url: pathOrUrl };

    const origin = typeof globalThis.location?.origin === 'string' ? globalThis.location.origin : undefined;
    if (this.runtime === 'browser' || (this.runtime === 'hybrid' && origin)) {
      if (/^file:\/\//i.test(pathOrUrl)) {
        throw new SdkError('CONFIG', 'file:// assets are not supported in browser runtime', { pathOrUrl });
      }
      if (!origin) {
        throw new SdkError('CONFIG', 'Cannot resolve relative asset URL without location.origin', { pathOrUrl, runtime: this.runtime });
      }
      return { kind: 'url', url: new URL(pathOrUrl, origin).toString() };
    }

    // Node (or hybrid without `window.location`): treat as a local filesystem path.
    if (/^file:\/\//i.test(pathOrUrl)) {
      return { kind: 'file', filePath: fileUrlToPathCompat(pathOrUrl) };
    }
    const nodePath = await import('node:path');
    return {
      kind: 'file',
      filePath: nodePath.isAbsolute(pathOrUrl) ? pathOrUrl : nodePath.resolve(process.cwd(), pathOrUrl),
    };
  }

  private async fetchUrlCached(key: string, url: string): Promise<ArrayBuffer> {
    const cacheKey = `${key}/${this.cacheKey(url)}`;
    const cached = await this.cache.load(cacheKey);
    if (cached) return cached;
    const response = await fetch(url);
    if (!response.ok) {
      throw new SdkError('ASSETS', `Failed to load resource: ${url} (${response.status})`, { url, status: response.status });
    }
    const buffer = await response.arrayBuffer();
    await this.cache.save(cacheKey, buffer);
    return buffer;
  }

  private async readLocalFile(filePath: string): Promise<ArrayBuffer> {
    try {
      const fs = await import('node:fs/promises');
      const buffer = await fs.readFile(filePath);
      return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    } catch (error) {
      throw new SdkError('ASSETS', `Failed to read local asset: ${filePath}`, { filePath }, error);
    }
  }

  private async fetchSourceCached(key: string, source: AssetSource): Promise<ArrayBuffer> {
    if (source.kind === 'file') return this.readLocalFile(source.filePath);
    return this.fetchUrlCached(key, source.url);
  }

  private async fetchShards(key: string, paths: string[]): Promise<ArrayBuffer> {
    if (!paths.length) {
      throw new SdkError('ASSETS', 'Asset shards must include at least one path', { key });
    }
    const shardSources = await Promise.all(paths.map((pathOrUrl) => this.resolveAssetSource(pathOrUrl)));
    const buffers = await Promise.all(shardSources.map((source, index) => this.fetchSourceCached(`${key}/${index}`, source)));
    const total = buffers.reduce((sum, buf) => sum + buf.byteLength, 0);
    const merged = new Uint8Array(total);
    let offset = 0;
    for (const buf of buffers) {
      merged.set(new Uint8Array(buf), offset);
      offset += buf.byteLength;
    }
    return merged.buffer;
  }

  private async fetchHex(filename: string): Promise<string> {
    const buffer = await this.fetchBinary(filename);
    return arrayBufferToHex(buffer);
  }

  private async fetchText(filename: string): Promise<string> {
    const override = this.config.assetsOverride?.[filename];
    if (!override) {
      throw new SdkError('ASSETS', `Missing assetsOverride for ${filename}`, { filename });
    }
    if (typeof override !== 'string') {
      throw new SdkError('ASSETS', `Asset ${filename} must be provided as a single URL or file path`, { filename });
    }
    const source = await this.resolveAssetSource(override);
    if (source.kind === 'file') {
      try {
        const fs = await import('node:fs/promises');
        const text = await fs.readFile(source.filePath, 'utf8');
        this.verifyTextIntegrity(filename, text);
        return text;
      } catch (error) {
        throw new SdkError('ASSETS', `Failed to read local text asset: ${filename}`, { filename, filePath: source.filePath }, error);
      }
    }
    const cacheKey = `text/${filename}/${this.cacheKey(source.url)}`;
    const cached = await this.cache.load(cacheKey);
    if (cached) {
      const text = this.textDecoder.decode(cached);
      try {
        this.verifyTextIntegrity(filename, text);
        return text;
      } catch {
        // cache may be corrupted; fallthrough to refetch
      }
    }

    const response = await fetch(source.url);
    if (!response.ok) {
      throw new SdkError('ASSETS', `Failed to load resource: ${source.url} (${response.status})`, { url: source.url, status: response.status });
    }
    const buffer = await response.arrayBuffer();
    const text = this.textDecoder.decode(buffer);
    this.verifyTextIntegrity(filename, text);
    await this.cache.save(cacheKey, buffer);
    return text;
  }

  private verifyIntegrity(filename: string, buffer: ArrayBuffer) {
    const expected = this.config.assetsIntegrity?.[filename];
    if (!expected) return;
    const digest = sha256(new Uint8Array(buffer));
    const got = bytesToHex(digest);
    if (got.toLowerCase() !== expected.toLowerCase()) {
      throw new SdkError('ASSETS', `Asset integrity check failed for ${filename}`, {
        filename,
        expected: expected.toLowerCase(),
        got: got.toLowerCase(),
      });
    }
  }

  private verifyTextIntegrity(filename: string, text: string) {
    const expected = this.config.assetsIntegrity?.[filename];
    if (!expected) return;
    const digest = sha256(utf8ToBytes(text));
    const got = bytesToHex(digest);
    if (got.toLowerCase() !== expected.toLowerCase()) {
      throw new SdkError('ASSETS', `Asset integrity check failed for ${filename}`, {
        filename,
        expected: expected.toLowerCase(),
        got: got.toLowerCase(),
      });
    }
  }

  private async ensureGoRuntime() {
    if (typeof getGlobal('Go') === 'function') return;
    const scriptText = await this.fetchText('wasm_exec.js');
    // eslint-disable-next-line no-new-func
    const initializer = new Function(scriptText + '\nreturn Go;');
    const GoClass = initializer.call(globalThis);
    (globalThis as any).Go = GoClass;
  }

  async init(): Promise<void> {
    if (this.initialized) return;
    await this.ensureGoRuntime();
    const GoClass = getGlobal<any>('Go');
    if (typeof GoClass !== 'function') {
      throw new SdkError('ASSETS', 'Go runtime not available after loading wasm_exec.js');
    }
    const wasmBytes = await this.fetchBinary('app.wasm');
    this.goInstance = new GoClass();
    const { instance } = await WebAssembly.instantiate(wasmBytes, this.goInstance.importObject);
    this.goInstance.run(instance);
    this.initialized = true;
  }

  async initTransfer(): Promise<void> {
    if (this.transferReady) return;
    await this.init();
    const [csHex, pkHex] = await Promise.all([this.fetchHex('transfer.r1cs'), this.fetchHex('transfer.pk')]);
    const result = getGlobal<(cs: string, pk: string) => string>('initTransferCircuit');
    if (!result) throw new SdkError('PROOF', 'initTransferCircuit not found');
    const response = JSON.parse(result(csHex, pkHex));
    if (!response?.success && !String(response?.err).toLowerCase().includes('prover already exists')) {
      throw new SdkError('PROOF', response?.err || 'initTransferCircuit failed', { response });
    }
    this.transferReady = true;
  }

  async initWithdraw(): Promise<void> {
    if (this.withdrawReady) return;
    await this.init();
    const [csHex, pkHex] = await Promise.all([this.fetchHex('withdraw.r1cs'), this.fetchHex('withdraw.pk')]);
    const result = getGlobal<(cs: string, pk: string) => string>('initWithdrawCircuit');
    if (!result) throw new SdkError('PROOF', 'initWithdrawCircuit not found');
    const response = JSON.parse(result(csHex, pkHex));
    if (!response?.success && !String(response?.err).toLowerCase().includes('prover already exists')) {
      throw new SdkError('PROOF', response?.err || 'initWithdrawCircuit failed', { response });
    }
    this.withdrawReady = true;
  }

  async proveTransfer(witness: string): Promise<string> {
    await this.initTransfer();
    const handler = getGlobal<(witness: string, mode: 1 | 2) => string>('proveTransfer');
    if (!handler) {
      throw new SdkError('PROOF', 'proveTransfer is not available');
    }
    return handler(witness, 2);
  }

  async proveWithdraw(witness: string): Promise<string> {
    await this.initWithdraw();
    const handler = getGlobal<(witness: string, mode: 1 | 2) => string>('proveWithdraw');
    if (!handler) {
      throw new SdkError('PROOF', 'proveWithdraw is not available');
    }
    return handler(witness, 2);
  }

  createMemo(ro: CommitmentData) {
    return MemoKit.createMemo(ro);
  }

  decryptMemo(secretKey: bigint, memo: `0x${string}`) {
    return MemoKit.decryptMemo(secretKey, memo);
  }

  commitment(ro: CommitmentData, format: 'hex' | 'bigint' = 'hex') {
    return format === 'bigint' ? CryptoToolkit.commitment(ro, 'bigint') : CryptoToolkit.commitment(ro, 'hex');
  }

  nullifier(secretKey: bigint, commitment: `0x${string}`, freezerPk?: [bigint, bigint]) {
    return CryptoToolkit.nullifier(secretKey, commitment, freezerPk);
  }

  async createDummyRecordOpening(): Promise<CommitmentData> {
    await this.init();
    const handler = getGlobal<() => string>('createDummyRecordOpening');
    if (!handler) {
      throw new SdkError('WITNESS', 'createDummyRecordOpening not available');
    }
    const response = JSON.parse(handler());
    if (!response?.success) {
      throw new SdkError('WITNESS', response?.err || 'createDummyRecordOpening failed', { response });
    }
    return toCommitmentData(response.record_opening);
  }

  async createDummyInputSecret(): Promise<InputSecret> {
    await this.init();
    const handler = getGlobal<() => string>('createDummyInputSecret');
    if (!handler) throw new SdkError('WITNESS', 'createDummyInputSecret not available');
    const response = JSON.parse(handler());
    if (!response?.success) {
      throw new SdkError('WITNESS', response?.err || 'createDummyInputSecret failed', { response });
    }
    const input = response.input_secret;
    return {
      owner_keypair: {
        user_pk: {
          user_address: [BigInt(input.owner_keypair.user_pk.user_address[0]), BigInt(input.owner_keypair.user_pk.user_address[1])] as [bigint, bigint],
          aead_encryption_key: input.owner_keypair.user_pk.aead_encryption_key,
        },
        user_sk: {
          address_sk: input.owner_keypair.user_sk.address_sk,
          aead_decryption_key: input.owner_keypair.user_sk.aead_decryption_key,
        },
      },
      ro: toCommitmentData(input.ro),
      acc_member_witness: input.acc_member_witness,
    };
  }
}
