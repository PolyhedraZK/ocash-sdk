import { loadDemoConfig } from '../config/demoConfig.js';
import { KeyManager } from '@ocash/sdk';
import { stdin as input, stdout as output } from 'node:process';
import * as readline from 'node:readline/promises';
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { c } from '../cli/color.js';

type Hex = `0x${string}`;

type RpcRequest = { id: string; method: string; params?: any };
type RpcResponse =
  | { id: string; ok: true; result: any }
  | { id: string; ok: false; error: { message: string; stack?: string; name?: string; code?: string; detail?: any; cause?: any } };

type WorkerLogEntry = {
  ts: number;
  level: 'debug' | 'info' | 'warn' | 'error';
  scope: string;
  message: string;
  detail?: any;
};

type WorkerLogEvent = { type: 'log'; log: WorkerLogEntry };

const safeStringify = (value: unknown) => {
  try {
    return JSON.stringify(value, (_k, v) => (typeof v === 'bigint' ? v.toString() : v), 2);
  } catch {
    return String(value);
  }
};

const once = <T>(emitter: NodeJS.EventEmitter, event: string) =>
  new Promise<T>((resolve) => emitter.once(event, resolve as any));

const makeId = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const formatWorkerLogLine = (log: WorkerLogEntry) => {
  const detail = log.detail != null ? ` ${safeStringify(log.detail)}` : '';
  if (log.scope === 'sync') {
    return [c.magenta('[sync]'), c.cyan(log.message)];
  }
  if (log.scope.startsWith('contract:')) {
    const name = log.scope.split(':', 2)[1] || log.scope;
    return [c.dim(`[${name}]`), c.gray(log.message + detail)];
  }
  if (log.level === 'debug') {
    return [c.gray(`[debug:${log.scope}]`), c.dim(log.message + detail)];
  }
  if (log.level === 'warn') {
    return [c.yellow(`[warn:${log.scope}]`), c.yellow(log.message), c.dim(detail)];
  }
  if (log.level === 'error') {
    return [c.red(`[error:${log.scope}]`), c.red(log.message), c.dim(detail)];
  }
  return [c.gray(`[${log.scope}]`), log.message + detail];
};

export async function demoAll(options: { flags: Record<string, string | boolean | undefined> }) {
  const config = await loadDemoConfig({ configPath: options.flags.config });
  const chainId = typeof options.flags.chainId === 'string' ? Number(options.flags.chainId) : undefined;
  const pollMs = typeof options.flags.pollMs === 'string' ? Number(options.flags.pollMs) : undefined;
  const streamSync = options.flags.streamSync === true || options.flags.streamSync === '1' || options.flags.streamSync === 'true';

  const pub = KeyManager.getPublicKeyBySeed(config.seed, config.accountNonce != null ? String(config.accountNonce) : undefined);
  const selfViewingAddress = KeyManager.userPkToAddress(pub.user_pk) as Hex;
  const baseDir = path.join(config.storageDir ?? '.ocash-demo', 'demoAll');

  // Fork a background worker process to run SDK sync/watch without spamming the interactive terminal.
  const ext = import.meta.url.endsWith('.ts') ? '.ts' : '.js';
  const workerUrl = new URL(`../workers/demoAllWorker${ext}`, import.meta.url);
  const workerPath = fileURLToPath(workerUrl);

  const configPath = typeof options.flags.config === 'string' ? options.flags.config : undefined;
  const childArgs = [
    `baseDir=${baseDir}`,
    `chainId=${chainId ?? ''}`,
    `pollMs=${pollMs ?? ''}`,
    `streamLogs=1`,
    `streamSync=${streamSync ? '1' : '0'}`,
  ];
  if (configPath) {
    childArgs.unshift(`configPath=${configPath}`);
  }

  const child = fork(workerPath, childArgs, {
    execArgv: process.execArgv,
    stdio: ['inherit', 'ignore', 'inherit', 'ipc'],
  });

  const pending = new Map<string, { resolve: (v: any) => void; reject: (e: any) => void }>();
  let showDebugLogs = false;
  child.on('message', (msg: any) => {
    const logEvt = msg as WorkerLogEvent;
    if (logEvt && logEvt.type === 'log' && logEvt.log) {
      if (logEvt.log.level === 'debug' && !showDebugLogs) return;
      const parts = formatWorkerLogLine(logEvt.log);
      console.log(...parts);
      return;
    }
    if (msg && msg.type === 'ready') return;
    const res = msg as RpcResponse;
    if (!res || typeof res !== 'object' || typeof (res as any).id !== 'string') return;
    const p = pending.get(res.id);
    if (!p) return;
    pending.delete(res.id);
    if (res.ok) p.resolve(res.result);
    else {
      const e = new Error(res.error?.message ?? 'worker error');
      if (res.error?.stack) e.stack = res.error.stack;
      (e as any).name = res.error?.name ?? e.name;
      (e as any).code = res.error?.code;
      (e as any).detail = res.error?.detail;
      (e as any).cause = res.error?.cause;
      p.reject(e);
    }
  });
  child.on('exit', (code) => {
    for (const [, p] of pending) p.reject(new Error(`worker exited (code=${code ?? 'null'})`));
    pending.clear();
  });

  // wait worker ready
  await new Promise<void>((resolve, reject) => {
    const onMsg = (msg: any) => {
      if (msg && msg.type === 'ready') {
        child.off('message', onMsg);
        resolve();
      }
    };
    child.on('message', onMsg);
    child.once('exit', (code) => reject(new Error(`worker exited before ready (code=${code ?? 'null'})`)));
  });

  const rpc = (method: string, params?: any) =>
    new Promise<any>((resolve, reject) => {
      const id = makeId();
      pending.set(id, { resolve, reject });
      const req: RpcRequest = { id, method, params };
      child.send(req);
    });

  const rl = readline.createInterface({ input, output });
  rl.on('SIGINT', () => rl.close());

  const menu = [
    { key: 'help', label: 'Help' },
    { key: 'address', label: 'Viewing Address' },
    { key: 'assets', label: 'Assets' },
    { key: 'balance-unspent', label: 'Balance (Unspent)' },
    { key: 'balance-spent', label: 'Assets (Spent)' },
    { key: 'balance-details', label: 'Balance Details' },
    { key: 'history', label: 'History' },
    { key: 'sync', label: 'Sync Progress' },
    { key: 'sync-follow', label: 'Toggle live sync logs' },
    { key: 'debug', label: 'Toggle debug logs' },
    { key: 'transfer', label: 'Transfer' },
    { key: 'withdraw', label: 'Withdraw' },
    { key: 'logs', label: 'Logs' },
    { key: 'exit', label: 'Exit' },
  ] as const;

  const printHelp = () => {
    console.log('demoAll (interactive)');
    console.log('Quick select: input a number, 0=help');
    console.log(menu.map((m, idx) => `${idx}) ${m.key}${m.label ? ` - ${m.label}` : ''}`).join('\n'));
  };

  console.log(c.bold('demoAll'));
  console.log('viewingAddress:', selfViewingAddress);
  console.log('storeDir:', baseDir);
  printHelp();

  const promptToken = async () => {
    const assets = await rpc('assets');
    const tokens: Array<{ symbol: string }> = Array.isArray(assets?.tokens) ? assets.tokens : [];
    if (tokens.length) {
      console.log(tokens.map((t, i) => `${i + 1}) ${t.symbol}`).join('  '));
    }
    const ans = (await rl.question(`token (index or symbol, default 1): `)).trim();
    if (!ans) return undefined;
    const idx = Number(ans);
    if (Number.isFinite(idx) && idx >= 1 && idx <= tokens.length) return tokens[idx - 1]!.symbol;
    return ans;
  };
  const promptAmount = async (options?: { defaultValue?: string; hint?: string }) => {
    const hint = options?.hint ? ` ${options.hint}` : '';
    const ans = (await rl.question(`amount${hint}: `)).trim();
    if (!ans) {
      if (options?.defaultValue != null) return options.defaultValue;
      throw new Error('amount is required');
    }
    return ans;
  };
  const promptTo = async () => (await rl.question(`to (viewing address, default self): `)).trim();
  const promptRecipient = async () => {
    const ans = (await rl.question(`recipient (EVM address): `)).trim();
    if (!ans) throw new Error('recipient is required');
    return ans;
  };
  const promptConfirm = async (label: string) => {
    const ans = (await rl.question(label)).trim().toLowerCase();
    return ans === 'y' || ans === 'yes' || ans === '1' || ans === 'true';
  };

  try {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const line = (await rl.question(c.dim('ocash> '))).trim();
      const first = line.split(/\s+/)[0]?.toLowerCase();
      const asInt = first && /^-?\d+$/.test(first) ? Number(first) : Number.NaN;
      const cmd =
        Number.isFinite(asInt) && asInt >= 0 && asInt < menu.length
          ? menu[asInt]!.key
          : first;
      if (!cmd) continue;

      try {
        if (cmd === 'help' || cmd === '?') {
          printHelp();
          continue;
        }
        if (cmd === 'exit' || cmd === 'quit' || cmd === 'q') break;
        if (cmd === 'assets') {
          console.log(safeStringify(await rpc('assets')));
          continue;
        }
        if (cmd === 'address') {
          console.log(safeStringify(await rpc('address')));
          continue;
        }
        if (cmd === 'balance' || cmd === 'balance-unspent' || cmd === 'balanceunspent') {
          console.log(safeStringify(await rpc('balance-unspent')));
          continue;
        }
        if (cmd === 'balance-spent' || cmd === 'balancespent') {
          console.log(safeStringify(await rpc('balance-spent')));
          continue;
        }
        if (cmd === 'balance-details' || cmd === 'balancedetails') {
          console.log(safeStringify(await rpc('balance-details')));
          continue;
        }
        if (cmd === 'history') {
          const limitRaw = (await rl.question('limit (default 20): ')).trim();
          const limit = limitRaw ? Number(limitRaw) : 20;
          console.log(safeStringify(await rpc('history', { limit })));
          continue;
        }
        if (cmd === 'sync') {
          console.log(safeStringify(await rpc('sync-status')));
          continue;
        }
        if (cmd === 'sync-follow' || cmd === 'syncfollow') {
          const enabledRaw = (await rl.question('enable live sync logs? (y/N): ')).trim().toLowerCase();
          const enabled = enabledRaw === 'y' || enabledRaw === 'yes' || enabledRaw === '1' || enabledRaw === 'true';
          console.log(safeStringify(await rpc('set-sync-stream', { enabled })));
          continue;
        }
        if (cmd === 'debug') {
          showDebugLogs = !showDebugLogs;
          console.log(safeStringify({ debugLogs: showDebugLogs }));
          continue;
        }
        if (cmd === 'transfer') {
          const token = await promptToken();
          const to = await promptTo();
          const defaults = await rpc('transfer-defaults', { token: token || undefined });
          const amount = await promptAmount({ defaultValue: defaults?.defaultAmount, hint: defaults?.defaultAmount ? `(default ${defaults.defaultAmount})` : undefined });
          const preview = await rpc('transfer-preview', { token: token || undefined, amount });
          console.log(`合并次数: ${preview?.mergeCount ?? 0}`);
          console.log(`RelayerFee: ${preview?.relayerFee?.formatted ?? '-'} (${preview?.relayerFee?.raw ?? '-'})`);
          console.log(`ProtocolFee: ${preview?.protocolFee?.formatted ?? '-'} (${preview?.protocolFee?.raw ?? '-'})`);
          if (preview && preview.ok === false) {
            console.log(c.yellow('warning: insufficient balance for requested amount'));
          }
          const confirmed = await promptConfirm('confirm transfer? (y/N): ');
          if (!confirmed) {
            console.log(c.gray('cancelled'));
            continue;
          }
          console.log(safeStringify(await rpc('transfer', { token: token || undefined, amount, to: to || undefined })));
          continue;
        }
        if (cmd === 'withdraw') {
          const token = await promptToken();
          const amount = await promptAmount();
          const recipient = await promptRecipient();
          const preview = await rpc('withdraw-preview', { token: token || undefined, amount });
          console.log(`合并次数: ${preview?.mergeCount ?? 0}`);
          console.log(`RelayerFee: ${preview?.relayerFee?.formatted ?? '-'} (${preview?.relayerFee?.raw ?? '-'})`);
          console.log(`ProtocolFee: ${preview?.protocolFee?.formatted ?? '-'} (${preview?.protocolFee?.raw ?? '-'})`);
          if (preview && preview.ok === false) {
            console.log(c.yellow('warning: insufficient balance for requested amount'));
          }
          const confirmed = await promptConfirm('confirm withdraw? (y/N): ');
          if (!confirmed) {
            console.log(c.gray('cancelled'));
            continue;
          }
          console.log(safeStringify(await rpc('withdraw', { token: token || undefined, amount, recipient })));
          continue;
        }
        if (cmd === 'logs') {
          const limitRaw = (await rl.question('limit (default 50): ')).trim();
          const limit = limitRaw ? Number(limitRaw) : 50;
          const logs = (await rpc('logs', { limit })) as WorkerLogEntry[];
          if (!Array.isArray(logs) || logs.length === 0) {
            console.log(c.gray('(no logs)'));
            continue;
          }
          for (const log of logs) {
            const parts = formatWorkerLogLine(log as any);
            console.log(...parts);
          }
          continue;
        }
        console.log(c.yellow('unknown command:'), cmd);
        printHelp();
      } catch (err) {
        const anyErr = err as any;
        const msg = err instanceof Error ? err.message : String(err);
        const code = typeof anyErr?.code === 'string' ? anyErr.code : undefined;
        const detail = anyErr?.detail != null ? ` detail=${safeStringify(anyErr.detail)}` : '';
        const cause =
          anyErr?.cause && typeof anyErr.cause === 'object'
            ? ` cause=${safeStringify(anyErr.cause)}`
            : anyErr?.cause != null
              ? ` cause=${String(anyErr.cause)}`
              : '';
        console.error(c.red('error:'), msg + (code ? ` (code=${code})` : '') + detail + cause);
      }
    }
  } finally {
    try {
      await rpc('shutdown');
    } catch {}
    child.kill('SIGINT');
    rl.close();
  }
}
