# UTXO Model

## What is a UTXO?

A UTXO (Unspent Transaction Output) represents a discrete unit of value owned by a specific key. Unlike account-based systems (like Ethereum's native model), UTXO systems track individual "coins" that can be consumed and created.

In OCash, each UTXO is represented on-chain as a **commitment** — a cryptographic hash that hides the owner, amount, and asset type.

## Commitment Structure

Each UTXO commitment is a Poseidon2 hash over:

```
commitment = Poseidon2(asset_id, asset_amount, user_pk.x, user_pk.y, blinding_factor)
```

| Field | Type | Description |
|-------|------|-------------|
| `asset_id` | `bigint` | Token/pool identifier |
| `asset_amount` | `bigint` | Amount in base units |
| `user_pk` | `[bigint, bigint]` | Owner's BabyJubjub public key |
| `blinding_factor` | `bigint` | Random value for hiding |

The commitment reveals nothing about the contents — only the owner with the secret key can decode it.

## Nullifiers

When a UTXO is spent, a **nullifier** is published on-chain:

```
nullifier = Poseidon2(commitment, secret_key, merkle_index)
```

The nullifier uniquely identifies a spent UTXO without revealing which commitment it corresponds to. The contract maintains a set of used nullifiers to prevent double-spending.

## Merkle Tree

All commitments are inserted into an append-only Merkle tree (depth 32, Poseidon2 hashing). The tree root is stored on-chain.

To prove ownership of a UTXO, the prover demonstrates:
1. Knowledge of the commitment's preimage (amount, key, blinding factor)
2. A valid Merkle membership proof (the commitment exists in the tree)
3. A correct nullifier derivation

All of this is done inside a zk-SNARK circuit — the verifier learns nothing about the inputs.

## Transaction Flow

### Deposit (Shield)

```
ERC-20 tokens → OCash Contract → New UTXO commitment + encrypted memo
```

The deposit creates a commitment on-chain and attaches an encrypted memo so the recipient can later decode the UTXO.

### Transfer (Private)

```
Input UTXOs (consumed) → zk-SNARK proof → Output UTXOs (created)
```

A transfer consumes 1-3 input UTXOs and creates 1-2 output UTXOs:
- One for the recipient
- One for change (back to sender)
- Nullifiers published for inputs
- New commitments published for outputs

### Withdraw (Unshield)

```
Input UTXO (consumed) → zk-SNARK proof → ERC-20 tokens released
```

A withdrawal proves ownership of a UTXO and releases the equivalent ERC-20 tokens to a specified address.

## Merge Operations

The circuit supports at most 3 input UTXOs per transfer. If a user has many small UTXOs (dust), they must be **merged** first:

```
[UTXO₁, UTXO₂, UTXO₃] → merge → [UTXO_merged]
[UTXO_merged, UTXO₄, UTXO₅] → merge → [UTXO_merged₂]
[UTXO_merged₂] → transfer → [UTXO_recipient, UTXO_change]
```

The planner module handles this automatically — `mergeCount` in the fee summary indicates how many merge steps are needed.

## UTXO Record

In the SDK, a decoded UTXO is represented as:

```ts
interface UtxoRecord {
  chainId: number;
  assetId: string;
  amount: bigint;
  commitment: Hex;    // On-chain commitment hash
  nullifier: Hex;     // Precomputed nullifier
  mkIndex: number;    // Merkle tree leaf index
  isFrozen: boolean;  // Frozen by freezer authority
  isSpent: boolean;   // Nullifier published on-chain
  memo?: Hex;         // Encrypted memo (if available)
  createdAt?: number; // Timestamp
}
```

Unspent, unfrozen UTXOs are available for transfers and withdrawals.
