import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import https from 'https';
import http from 'http';
import axios from 'axios';
import { URL, fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const OUTPUT_DIR = path.resolve(__dirname, process.env.OUTPUT_DIR || 'assets');
const metadataBaseUrl = process.env.R2_BASE_URL || 'https://pub-0510cc4d530a4fa996e01b0e7f15994a.r2.dev';
const METADATA_KEY = process.env.HASH || process.env.BRANCH || 'batrider';
const LOCAL_ASSETS_DIR = process.env.LOCAL_ASSETS_DIR;

const FILES_TO_DOWNLOAD = [
  { filename: 'transfer.pk', r2Path: 'transfer.pk', type: 'circuit' },
  { filename: 'transfer.r1cs', r2Path: 'transfer.r1cs', type: 'circuit' },
  { filename: 'withdraw.r1cs', r2Path: 'withdraw.r1cs', type: 'circuit' },
  { filename: 'withdraw.pk', r2Path: 'withdraw.pk', type: 'circuit' },
  { filename: 'app.wasm', r2Path: 'app.wasm', type: 'wasm' },
];

async function fetchMetadata() {
  const metadataUrl = `${metadataBaseUrl}/metadata/${METADATA_KEY}.json`;
  console.log(`\n========== Fetching Metadata ==========`);
  console.log(`URL: ${metadataUrl}`);

  const response = await axios.get(metadataUrl, { timeout: 30000 });
  console.log('Metadata content:');
  console.log(JSON.stringify(response.data, null, 2));
  console.log('========================================\n');

  return {
    commitHash: response.data.commit_hash,
    baseUrl: response.data.base_url,
    buildTime: response.data.build_time,
    branch: response.data.branch,
  };
}

class SdkWasmBuilder {
  constructor(outputDir) {
    this.outputDir = outputDir;
    this.maxFileSize = 4 * 1024 * 1024; // 4MB
    this.splitSize = '3799k';
    this.targetExtensions = ['.wasm', '.pk', '.r1cs', '.js'];
    this.manifest = new Map();
  }

  ensureOutputDir() {
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  calculateFileHash(buffer) {
    const hashSum = crypto.createHash('sha256');
    hashSum.update(buffer);
    return hashSum.digest('hex').substring(0, 8);
  }

  processLocalFile(filePath, filename) {
    const fileBuffer = fs.readFileSync(filePath);
    const totalSize = fileBuffer.length;
    const fileSha256 = crypto.createHash('sha256').update(fileBuffer).digest('hex');
    const fileHash = fileSha256.substring(0, 8);
    const fileExt = path.extname(filename).toLowerCase();
    this.processStreamBuffer(fileBuffer, filename, fileExt, fileHash, fileSha256, totalSize);
  }

  async downloadAndProcessStream(url, filename) {
    return new Promise((resolve, reject) => {
      const parsedUrl = new URL(url);
      const client = parsedUrl.protocol === 'https:' ? https : http;

      console.log(`Streaming from R2: ${url}`);

      const request = client.get(url, (response) => {
        if (response.statusCode === 200) {
          const chunks = [];
          let totalSize = 0;
          const hashSum = crypto.createHash('sha256');

          response.on('data', (chunk) => {
            chunks.push(chunk);
            totalSize += chunk.length;
            hashSum.update(chunk);
          });

          response.on('end', () => {
            const fileBuffer = Buffer.concat(chunks);
            const fileSha256 = hashSum.digest('hex');
            const fileHash = fileSha256.substring(0, 8);
            const fileExt = path.extname(filename).toLowerCase();

            console.log(`Streamed ${filename}: ${(totalSize / 1024 / 1024).toFixed(2)}MB`);

            try {
              this.processStreamBuffer(fileBuffer, filename, fileExt, fileHash, fileSha256, totalSize);
              resolve();
            } catch (error) {
              reject(error);
            }
          });

          response.on('error', (err) => reject(err));
        } else if (response.statusCode === 302 || response.statusCode === 301) {
          this.downloadAndProcessStream(response.headers.location, filename).then(resolve).catch(reject);
        } else {
          reject(new Error(`Failed to stream ${url}. Status: ${response.statusCode}`));
        }
      });

      request.on('error', (err) => reject(err));
      request.setTimeout(30000, () => {
        request.abort();
        reject(new Error(`Stream timeout for ${url}`));
      });
    });
  }

  processStreamBuffer(fileBuffer, filename, fileExt, fileHash, fileSha256, totalSize) {
    console.log(`Processing streamed file: ${filename}`);
    this.ensureOutputDir();

    if (totalSize > this.maxFileSize && this.targetExtensions.includes(fileExt)) {
      console.log(`File ${filename} is larger than 4MB, splitting...`);

      const fileNameWithoutExt = path.basename(filename, path.extname(filename));
      const fileExtWithoutDot = fileExt.replace('.', '');
      const splitSize = parseInt(this.splitSize.replace('k', '')) * 1024;
      const fileCount = Math.ceil(totalSize / splitSize);
      const dirName = `${fileNameWithoutExt}_${fileExtWithoutDot}_${fileCount}_${fileHash}`;
      const dirPath = path.join(this.outputDir, dirName);

      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }

      for (let i = 0; i < fileCount; i++) {
        const start = i * splitSize;
        const end = Math.min(start + splitSize, totalSize);
        const chunk = fileBuffer.subarray(start, end);
        const chunkFilename = String(i).padStart(2, '0');
        fs.writeFileSync(path.join(dirPath, chunkFilename), chunk);
      }

      this.manifest.set(filename, {
        type: 'split',
        path: dirName,
        count: fileCount,
        extension: fileExt,
        size: totalSize,
        hash: fileHash,
        sha256: fileSha256,
      });

      console.log(`Split ${filename} into ${fileCount} parts -> ${dirName}`);
    } else {
      const fileNameWithoutExt = path.basename(filename, path.extname(filename));
      const hashedFileName = `${fileNameWithoutExt}_${fileHash}${fileExt}`;
      const destPath = path.join(this.outputDir, hashedFileName);

      fs.writeFileSync(destPath, fileBuffer);

      this.manifest.set(filename, {
        type: 'single',
        path: hashedFileName,
        count: 1,
        extension: fileExt,
        size: totalSize,
        hash: fileHash,
        sha256: fileSha256,
      });

      console.log(`Saved ${filename} -> ${hashedFileName}`);
    }
  }

  writeManifest(metadata) {
    if (!fs.existsSync(this.outputDir)) {
      return;
    }

    const manifest = {
      generated_at: new Date().toISOString(),
      metadata,
      files: Object.fromEntries(this.manifest),
    };

    const manifestPath = path.join(this.outputDir, 'manifest.json');
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    console.log(`Wrote manifest: ${path.relative(process.cwd(), manifestPath)}`);
  }

  async build(assetsBaseUrl, metadata) {
    console.log(`\n========== Streaming Files from R2 ==========`);
    console.log(`Assets Base URL: ${assetsBaseUrl}`);
    console.log(`Target Directory: ${this.outputDir}`);

    for (const file of FILES_TO_DOWNLOAD) {
      const fullUrl = `${assetsBaseUrl}/${file.r2Path}`;
      console.log(`  • [${file.type}] ${file.filename}`);
      console.log(`      ${fullUrl}`);
      await this.downloadAndProcessStream(fullUrl, file.filename);
    }

    console.log(`==============================================\n`);
    this.writeManifest(metadata);
  }
}

async function main() {
  console.log(`\n╔══════════════════════════════════════════════════════════════╗`);
  console.log(`║          SDK WASM Build Script Starting                      ║`);
  console.log(`╚══════════════════════════════════════════════════════════════╝\n`);

  console.log('Configuration:');
  console.log(`  Metadata Base URL: ${metadataBaseUrl}`);
  console.log(`  Metadata Key: ${METADATA_KEY}`);

  const builder = new SdkWasmBuilder(OUTPUT_DIR);
  const includeWasmExec = process.env.INCLUDE_WASM_EXEC_JS === '1';

  if (LOCAL_ASSETS_DIR) {
    console.log('\n========== Local Assets Mode ==========');
    console.log(`Source Directory: ${LOCAL_ASSETS_DIR}`);
    console.log(`Target Directory: ${OUTPUT_DIR}`);
    console.log('======================================\n');

    const files = [...FILES_TO_DOWNLOAD];
    if (includeWasmExec) files.unshift({ filename: 'wasm_exec.js', r2Path: 'wasm_exec.js', type: 'runtime' });

    const metadata = {
      mode: 'local',
      source_dir: path.resolve(LOCAL_ASSETS_DIR),
      build_time: new Date().toISOString(),
      commit_hash: process.env.COMMIT_HASH || 'local',
      branch: process.env.BRANCH || 'local',
      base_url: null,
    };

    for (const file of files) {
      const localPath = path.resolve(LOCAL_ASSETS_DIR, file.filename);
      if (!fs.existsSync(localPath)) {
        throw new Error(`Missing local asset: ${localPath} (set LOCAL_ASSETS_DIR or provide the file)`);
      }
      console.log(`  • [${file.type}] ${file.filename}`);
      console.log(`      ${localPath}`);
      builder.processLocalFile(localPath, file.filename);
    }
    builder.writeManifest(metadata);
  } else {
    console.log('\nFetching metadata from R2...');
    const metadata = await fetchMetadata();

    console.log(`\n========== Build Info ==========`);
    console.log(`Branch:          ${metadata.branch}`);
    console.log(`Commit Hash:     ${metadata.commitHash}`);
    console.log(`Build Time:      ${metadata.buildTime}`);
    console.log(`Assets Base URL: ${metadata.baseUrl}`);
    console.log(`=================================\n`);

    if (includeWasmExec) {
      FILES_TO_DOWNLOAD.unshift({ filename: 'wasm_exec.js', r2Path: 'wasm_exec.js', type: 'runtime' });
    }
    await builder.build(metadata.baseUrl, metadata);
  }

  console.log(`\n╔══════════════════════════════════════════════════════════════╗`);
  console.log(`║          SDK WASM Build Script Completed                     ║`);
  console.log(`╚══════════════════════════════════════════════════════════════╝\n`);
}

main().catch((error) => {
  console.error('Build failed:', error.message);
  process.exit(1);
});
