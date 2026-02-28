import { loadDemoConfig } from '../config/demoConfig.js';
import { createDemoSdk } from '../sdk/createDemoSdk.js';
import { KeyManager } from '@ocash/sdk';
import { FileStore } from '@ocash/sdk/node';
import { parseArgs } from './args.js';
import { demoAssets } from '../scenes/assets.js';
import { demoBalance } from '../scenes/balance.js';
import { demoBalanceDetails } from '../scenes/balanceDetails.js';
import { demoDeposit } from '../scenes/deposit.js';
import { demoAll } from '../scenes/demoAll.js';
import { demoHistory } from '../scenes/history.js';
import { demoInit } from '../scenes/init.js';
import { demoMerkleListen } from '../scenes/merkleListen.js';
import { demoSync } from '../scenes/sync.js';
import { demoTransfer } from '../scenes/transfer.js';
import { demoTransferDebug } from '../scenes/transferDebug.js';
import { demoWithdraw } from '../scenes/withdraw.js';

const helpText = `
@ocash/sdk Node demo

Usage:
  pnpm run demo:node -- <command> [--flags]

Commands:
  init
  sync
  merkle-listen
  demoAll
  assets
  balance
  balance-details
  history
  deposit
  transfer
  transfer-debug
  withdraw

Flags:
  --help
  --config <path>               config file path (default: demos/node/ocash.config.json)
  --chainId <number>
  --token <symbol|tokenId>      (assets/deposit/transfer/withdraw) token selector
  --amount <number>             (deposit/transfer/withdraw) amount in token units
  --to <0x...>                  (transfer) OCash viewing address (0x + 64 hex chars)
  --recipient <0x...>           (withdraw) EVM recipient address
  --privateKey <0x...>          (deposit) signer private key (or config/env)
  --relayerConfig               (assets) sync & print relayer config
  --limit <number>               (history) max rows
  --offset <number>              (history) pagination offset
  --type <string>                (history) operation type filter
  --status <created|submitted|confirmed|failed>  (history) status filter
  --tokenId <string>             (history) tokenId filter
  --sort <asc|desc>              (history) sort order (default desc)
  --pageSize <number>            (sync) memo/nullifier page size
  --requestTimeoutMs <number>    (sync) request timeout
  --watch                         (sync) continuous sync via sdk.sync.start()
  --pollMs <number>              (sync --watch) polling interval
  --ms <number>                  (sync --watch / merkle-listen) stop after N ms
  --streamSync                    (demoAll) stream live sync logs

Config:
  Uses demos/node/ocash.config.json (see demos/node/ocash.config.example.json)

Notes:
  transfer-debug defaults: --token 1, --to self viewing address, --amount = ceil(relayerFee * 1.01)
`;

export async function runCli(argv: string[]) {
  const { positionals, flags } = parseArgs(argv);
  const command = positionals[0];
  if (!command || flags.help) {
    process.stdout.write(helpText.trimStart());
    process.stdout.write('\n');
    return;
  }

  const config = await loadDemoConfig({ configPath: flags.config });
  const isDemoAll = command === 'demoAll' || command === 'demo-all';
  if (isDemoAll) {
    await demoAll({ flags: flags });
    return;
  }

  const baseDir = config.storageDir ?? '.ocash-demo';
  const pub = KeyManager.getPublicKeyBySeed(config.seed, config.accountNonce != null ? String(config.accountNonce) : undefined);
  const walletId = KeyManager.userPkToAddress(pub.user_pk);
  const store = new FileStore({ baseDir });
  await store.init({ walletId });
  const toNum = (v: unknown) => {
    if (typeof v !== 'string' || !v.length) return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  };
  const sdk = createDemoSdk({
    config,
    storage: store,
    verboseEvents: true,
    sync: {
      pageSize: toNum(flags.pageSize),
      requestTimeoutMs: toNum(flags.requestTimeoutMs),
      pollMs: toNum(flags.pollMs),
    },
  });

  const ctx = { sdk, store: sdk.storage.getAdapter(), config, flags };

  switch (command) {
    case 'init':
      await demoInit(ctx);
      return;
    case 'sync':
      await demoSync(ctx);
      return;
    case 'merkle-listen':
      await demoMerkleListen(ctx);
      return;
    case 'assets':
      await demoAssets(ctx);
      return;
    case 'balance':
      await demoBalance(ctx);
      return;
    case 'balance-details':
      await demoBalanceDetails(ctx);
      return;
    case 'history':
      await demoHistory(ctx);
      return;
    case 'deposit':
      await demoDeposit(ctx);
      return;
    case 'transfer':
      await demoTransfer(ctx);
      return;
    case 'transfer-debug':
    case 'transferDebug':
      await demoTransferDebug(ctx);
      return;
    case 'withdraw':
      await demoWithdraw(ctx);
      return;
    default:
      throw new Error(`Unknown command: ${command}\n\n${helpText.trimStart()}`);
  }
}
