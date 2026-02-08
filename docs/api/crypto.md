# Keys & Crypto

## KeyManager (keys)

Static methods for key derivation and address conversion.

### `keys.deriveKeyPair(seed, nonce?)`

Derives a BabyJubjub key pair from a seed string.

```ts
const keyPair = sdk.keys.deriveKeyPair(seed, nonce);
// keyPair.secretKey: bigint
// keyPair.publicKey: { user_address: [bigint, bigint] }
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `seed` | `string` | Secret seed (min 16 characters) |
| `nonce` | `string?` | Optional nonce for key hierarchy |

### `keys.getPublicKeyBySeed(seed, nonce?)`

Derives only the public key from a seed (no secret key exposure).

```ts
const pubKey = sdk.keys.getPublicKeyBySeed(seed, nonce);
```

### `keys.getSecretKeyBySeed(seed, nonce?)`

Derives only the secret key from a seed.

```ts
const secretKey = sdk.keys.getSecretKeyBySeed(seed, nonce);
```

### `keys.userPkToAddress(userPk)`

Compresses a BabyJubjub public key to a 32-byte hex address.

```ts
const address = sdk.keys.userPkToAddress(pubKey);
// address: '0x...' (32 bytes)
```

### `keys.addressToUserPk(address)`

Decompresses a hex address back to BabyJubjub coordinates.

```ts
const pubKey = sdk.keys.addressToUserPk('0x...');
// pubKey: { user_address: [bigint, bigint] }
```

---

## CryptoToolkit (crypto)

Static cryptographic operations.

### `crypto.commitment(data)`

Computes a Poseidon2 commitment from record opening data.

```ts
const commitment = sdk.crypto.commitment({
  asset_id: 1n,
  asset_amount: 1000000n,
  user_pk: { user_address: [x, y] },
  blinding_factor: randomBigint,
  is_frozen: false,
});
// commitment: bigint
```

### `crypto.nullifier(commitment, secretKey, mkIndex)`

Computes a nullifier for a UTXO.

```ts
const nullifier = sdk.crypto.nullifier(commitment, secretKey, mkIndex);
// nullifier: bigint
```

### `crypto.createRecordOpening(params)`

Creates a complete record opening (commitment data) for a new UTXO.

```ts
const ro = sdk.crypto.createRecordOpening({
  assetId: 1n,
  amount: 1000000n,
  userPk: pubKey,
});
// ro: CommitmentData (with random blinding factor)
```

---

## MemoKit

Static methods for memo encryption and decryption.

### `MemoKit.createMemo(ro)`

Encrypts a record opening into a hex-encoded memo.

```ts
import { MemoKit } from '@ocash/sdk';

const memo = MemoKit.createMemo(recordOpening);
// memo: Hex
```

### `MemoKit.decodeMemoForOwner(input)`

Decrypts a memo using the owner's secret key.

```ts
const ro = MemoKit.decodeMemoForOwner({
  secretKey: ownerSecretKey,
  memo: '0x...',
  expectedAddress: ownerAddress,  // Optional validation
});
// ro: CommitmentData | null
```

### `MemoKit.decryptMemo(secretKey, encoded)`

Low-level memo decryption.

```ts
const ro = MemoKit.decryptMemo(secretKey, memoHex);
```
