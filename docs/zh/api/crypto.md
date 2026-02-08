# 密钥与密码学

## KeyManager (keys)

密钥派生和地址转换的静态方法。

### `keys.deriveKeyPair(seed, nonce?)`

从种子字符串派生 BabyJubjub 密钥对。

```ts
const keyPair = sdk.keys.deriveKeyPair(seed, nonce);
// keyPair.secretKey: bigint
// keyPair.publicKey: { user_address: [bigint, bigint] }
```

| 参数 | 类型 | 说明 |
|------|------|------|
| `seed` | `string` | 秘密种子（最少 16 字符） |
| `nonce` | `string?` | 可选 nonce，用于密钥层次 |

### `keys.getPublicKeyBySeed(seed, nonce?)`

仅派生公钥（不暴露私钥）。

### `keys.userPkToAddress(userPk)`

将 BabyJubjub 公钥压缩为 32 字节十六进制地址。

### `keys.addressToUserPk(address)`

将十六进制地址解压缩为 BabyJubjub 坐标。

---

## CryptoToolkit (crypto)

静态密码学操作。

### `crypto.commitment(data)`

从记录开启数据计算 Poseidon2 承诺。

### `crypto.nullifier(commitment, secretKey, mkIndex)`

计算 UTXO 的 nullifier。

### `crypto.createRecordOpening(params)`

创建新 UTXO 的完整记录开启（带随机盲因子）。

---

## MemoKit

memo 加密和解密的静态方法。

### `MemoKit.createMemo(ro)`

将记录开启加密为十六进制编码的 memo。

### `MemoKit.decodeMemoForOwner(input)`

使用所有者的私钥解密 memo。

```ts
const ro = MemoKit.decodeMemoForOwner({
  secretKey: ownerSecretKey,
  memo: '0x...',
  expectedAddress: ownerAddress,
});
```
