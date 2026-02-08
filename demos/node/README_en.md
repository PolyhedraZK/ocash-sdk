# @ocash/sdk Node.js Demo

A ready-to-run Node.js demo collection covering:

- Initialization and WASM loading progress
- Data synchronization (memos/nullifiers)
- Merkle tree build progress listening (contract event `ArrayMergedToTree`)
- Asset/relayer configuration queries
- Deposit / transfer / withdraw (with relayer submission and txhash polling)
- Balance queries / balance details (UTXO list)
- Operation history queries (local persistence in demo)

## Running

Build the SDK first, then run the demo:

```bash
pnpm install
pnpm run build
pnpm run demo:node -- --help
```

To skip `tsc` (faster hot run):

```bash
pnpm run demo:node:tsx -- --help
```

Note: `demo:node`/`demo:node:tsx` will build the SDK first; if you've changed SDK source (e.g., witness JSON structure), you don't need to run build separately.

## Configuration

Copy the example config and modify (defaults to reading `demos/node/ocash.config.json`; use `--config` to specify a path):

```bash
cp demos/node/ocash.config.example.json demos/node/ocash.config.json
```

Recommended configuration items:

- `seed`: For viewing address and memo decryption
- `chains[].rpcUrl`: On-chain read/write (deposit requires signer)
- `chains[].entryUrl`: Memos/nullifiers sync
- `chains[].relayerUrl`: Transfer/withdraw submission
- `chains[].merkleProofUrl`: Merkle proof retrieval (remote proof server)
- `assetsOverride`: WASM / r1cs / pk asset URLs

Deposit requires a signer private key (recommended for local demo use only):

- Set `signerPrivateKey` in `ocash.config.json`, or pass `--privateKey 0x...` at runtime
- Alternatively, set environment variable: `OCASH_DEMO_PRIVATE_KEY=0x...`

The demo writes local data to `demos/node/.ocash-demo/` (included in `.gitignore`).

Note: Some RPCs (e.g., `rpc.ankr.com`) require an API key for `eth_chainId`/contract calls. If you encounter `Unauthorized`, replace `chains[].rpcUrl` with a keyed URL (e.g., `https://rpc.ankr.com/eth_sepolia/<ANKR_API_KEY>`) or switch to another available Sepolia RPC.

## Demo Commands

General:

```bash
pnpm run demo:node -- init
pnpm run demo:node -- sync
pnpm run demo:node -- demoAll
pnpm run demo:node -- assets --relayerConfig
pnpm run demo:node -- balance
pnpm run demo:node -- balance-details
pnpm run demo:node -- history --limit 50
pnpm run demo:node -- merkle-listen
```

`demoAll` starts the full workflow (background processes handle SDK initialization / background memo+nullifier sync / `ArrayMergedToTree` listening / local Merkle building), and provides an interactive command-line interface in the foreground (to prevent background logs from interrupting input):

- `assets` / `balance` / `balance-details` / `history`
- `transfer` (interactive input for `token` / `amount` / `to`; empty `to` defaults to self-transfer)
- `withdraw` (interactive input for `token` / `amount` / `recipient`)
- `logs` (view background sync/sdk/contract event logs)

`merkle-listen` optional parameters:

- `--ms <number>`: Stop listening after N milliseconds

Business operations:

```bash
# deposit
pnpm run demo:node -- deposit --token SepoliaETH --amount 0.001

# transfer (--to is an OCash viewing address)
pnpm run demo:node -- transfer --token SepoliaETH --amount 0.0001 --to 0x...

# withdraw (--recipient is an EVM address)
pnpm run demo:node -- withdraw --token SepoliaETH --amount 0.0001 --recipient 0x...
```

## History Filtering/Pagination

```bash
# Filter by chain + type + status
pnpm run demo:node -- history --chainId 11155111 --type transfer --status confirmed

# Pagination
pnpm run demo:node -- history --limit 20 --offset 20

# Oldest first
pnpm run demo:node -- history --sort asc
```

## Sync Parameters

- `--pageSize <number>`: Sync memos/nullifiers page size (also passed as SDK default via `createSdk({ sync })`)
- `--requestTimeoutMs <number>`: Timeout per sync request (milliseconds)
- `--watch`: Continuous sync (calls `sdk.sync.start()`; polls at `pollMs` interval)
- `--pollMs <number>`: Polling interval in `--watch` mode (milliseconds)
- `--ms <number>`: Auto-stop after N milliseconds in `--watch` mode (optional)

Example:

```bash
pnpm run demo:node -- sync --watch --pollMs 5000
```
