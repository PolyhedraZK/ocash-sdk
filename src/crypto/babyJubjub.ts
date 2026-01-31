import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, toBytes } from '@noble/hashes/utils';
import type { Hash } from 'viem';
import type { UserKeyPair } from '../types';
import { BN254_FIELD_MODULUS } from './field';

// BabyJubjub 曲线参数
// Prime order of the alt_bn128 curve (used for curve operations)
export const BABYJUBJUB_SCALAR_FIELD = BN254_FIELD_MODULUS;

// Baby JubJub curve order (from gnark-crypto) - 这是私钥标量要使用的模数
export const BABYJUBJUB_ORDER = BigInt('2736030358979909402780800718157159386076813972158567259200215660948447373041');

// BabyJubjub Cofactor (from gnark-crypto) - 协因子，用于子群验证
export const BABYJUBJUB_COFACTOR = 8n;

// BabyJubjub 基点 (from gnark-crypto)
const BABYJUBJUB_BASE_POINT = {
  x: BigInt('9671717474070082183213120605117400219616337014328744928644933853176787189663'),
  y: BigInt('16950150798460657717958625567821834550301663161624707787222815936182638968203'),
};

// Curve parameters for equation ax^2 + y^2 = 1 + dx^2y^2 (from gnark-crypto)
// A = -1 in finite field (represented as p - 1)
const BABYJUBJUB_A = BABYJUBJUB_SCALAR_FIELD - 1n;
const BABYJUBJUB_D = BigInt('12181644023421730124874158521699555681764249180949974110617291017600649128846');

/**
 * BabyJubjub 曲线点乘运算
 * 使用 double-and-add 算法进行标量乘法
 */
function babyJubjubScalarMult(scalar: bigint): [bigint, bigint] {
  if (scalar === 0n) {
    return [0n, 1n]; // 单位元 (identity element)
  }

  let result: [bigint, bigint] = [0n, 1n]; // 单位元
  let base: [bigint, bigint] = [BABYJUBJUB_BASE_POINT.x, BABYJUBJUB_BASE_POINT.y];
  let rem = scalar;

  while (rem > 0n) {
    if (rem & 1n) {
      result = babyJubjubPointAdd(result, base);
    }
    base = babyJubjubPointAdd(base, base);
    rem >>= 1n;
  }

  return result;
}

/**
 * BabyJubjub 曲线点加法
 * 使用 Twisted Edwards 曲线加法公式
 */
function babyJubjubPointAdd(p1: [bigint, bigint], p2: [bigint, bigint]): [bigint, bigint] {
  const [x1, y1] = p1;
  const [x2, y2] = p2;

  if (x1 === 0n && y1 === 1n) return [x2, y2]; // p1 是单位元
  if (x2 === 0n && y2 === 1n) return [x1, y1]; // p2 是单位元

  // 使用预定义的曲线参数
  const a = BABYJUBJUB_A;
  const d = BABYJUBJUB_D;
  const p = BABYJUBJUB_SCALAR_FIELD;

  // Edwards 曲线加法公式，按照 zk-kit 实现
  // beta = x1*y2
  const beta = (x1 * y2) % p;
  // gamma = y1*x2
  const gamma = (y1 * x2) % p;
  // delta = (y1-(a*x1))*(x2+y2)
  const delta = (((y1 - ((a * x1) % p) + p) % p) * ((x2 + y2) % p)) % p;
  // tau = x1*x2*y1*y2
  const tau = (beta * gamma) % p;
  // dtau = d*x1*x2*y1*y2
  const dtau = (d * tau) % p;

  // x3 = (x1*y2 + y1*x2)/(1 + d*x1*x2*y1*y2)
  const x3 = (((beta + gamma) % p) * modInverse((1n + dtau) % p, p)) % p;

  // y3 = (y1*y2 - a*x1*x2)/(1 - d*x1*x2*y1*y2)
  // 使用 zk-kit 的优化公式: y3 = (delta + a*beta - gamma) / (1 - dtau)
  const y3Numerator = (delta + ((a * beta) % p) - gamma + p) % p;
  const y3Denominator = (1n - dtau + p) % p;
  const y3 = (y3Numerator * modInverse(y3Denominator, p)) % p;

  return [x3, y3];
}

/**
 * 模逆运算
 */
function modInverse(a: bigint, m: bigint): bigint {
  if (a < 0n) a = ((a % m) + m) % m;

  const g = extgcd(a, m);
  if (g[0] !== 1n) {
    throw new Error('Modular inverse does not exist');
  }

  return ((g[1] % m) + m) % m;
}

/**
 * 扩展欧几里得算法
 */
function extgcd(a: bigint, b: bigint): [bigint, bigint, bigint] {
  if (a === 0n) return [b, 0n, 1n];

  const [gcd, x1, y1] = extgcd(b % a, a);
  const x = y1 - (b / a) * x1;
  const y = x1;

  return [gcd, x, y];
}

/**
 * 从种子创建密钥对
 */
export function createKeyPairFromSeed(seed: Hash): UserKeyPair {
  const seedBytes = toBytes(seed);

  // 计算 seedHash = sha256(seed)
  const seedHash = sha256(seedBytes);

  // 生成 BabyJubjub 密钥对用于地址
  // 将 seedHash 转换为标量字段内的值，使用Baby Jubjub order作为模数（与Go保持一致）
  const hashBigInt = BigInt('0x' + bytesToHex(seedHash));
  const addressSk = hashBigInt % BABYJUBJUB_ORDER;
  // 计算公钥: addressPk = addressSk * G
  const [pubX, pubY] = babyJubjubScalarMult(addressSk);

  // 生成 Curve25519 密钥对用于 AEAD (与Go的box.GenerateKey保持一致)
  // const privateKey = seedHash.slice(0, 32); // Curve25519 私钥长度为 32 字节
  // const naclKeyPair = nacl.box.keyPair.fromSecretKey(privateKey);

  return {
    user_pk: {
      user_address: [pubX, pubY],
      // aead_encryption_key: BigInt(toHex(naclKeyPair.publicKey)),
    },
    user_sk: {
      address_sk: addressSk,
      // aead_decryption_key: BigInt(toHex(naclKeyPair.secretKey)),
    },
  };
}

/**
 * 验证点是否在 BabyJubjub 曲线上
 * 验证曲线方程 ax^2 + y^2 = 1 + dx^2y^2
 */
export function isPointOnCurve(point: [bigint, bigint]): boolean {
  const [x, y] = point;
  const p = BABYJUBJUB_SCALAR_FIELD;
  const a = BABYJUBJUB_A;
  const d = BABYJUBJUB_D;

  const x2 = (x * x) % p;
  const y2 = (y * y) % p;

  const left = (a * x2 + y2) % p;
  const right = (1n + ((d * x2 * y2) % p)) % p;

  return left === right;
}

/**
 * 通用的点乘法函数，可以乘以任意基点
 */
export function mulPoint(base: [bigint, bigint], scalar: bigint): [bigint, bigint] {
  if (scalar === 0n) {
    return [0n, 1n]; // 单位元
  }

  let result: [bigint, bigint] = [0n, 1n]; // 单位元
  let currentBase = base;
  let rem = scalar;

  while (rem > 0n) {
    if (rem & 1n) {
      result = babyJubjubPointAdd(result, currentBase);
    }
    currentBase = babyJubjubPointAdd(currentBase, currentBase);
    rem >>= 1n;
  }

  return result;
}

/**
 * 验证密钥对是否有效
 */
export function validateKeyPair(keyPair: UserKeyPair): boolean {
  try {
    // 验证 BabyJubjub 密钥对
    const addressSk = BigInt(keyPair.user_sk.address_sk);
    const [pubX, pubY] = babyJubjubScalarMult(addressSk);

    const actualX = BigInt(keyPair.user_pk.user_address[0]);
    const actualY = BigInt(keyPair.user_pk.user_address[1]);

    if (pubX !== actualX || pubY !== actualY) {
      console.error('BabyJubjub key pair validation failed');
      return false;
    }

    // 验证点是否在曲线上
    if (!isPointOnCurve([actualX, actualY])) {
      console.error('Public key point is not on the curve');
      return false;
    }

    // 验证 Curve25519 密钥对
    // 确保密钥长度为32字节，使用固定长度转换
    // const sk = numberToBytes(keyPair.user_sk.aead_decryption_key);
    // const naclKeyPair = nacl.box.keyPair.fromSecretKey(sk);
    // const actualPublicKey = BigInt(toHex(naclKeyPair.publicKey));
    // if (actualPublicKey !== keyPair.user_pk.aead_encryption_key) {
    //   console.error('Curve25519 key pair validation failed');
    //   return false;
    // }

    return true;
  } catch (error) {
    console.error('Key pair validation error:', error);
    return false;
  }
}

/**
 * 验证点是否在素数阶子群中
 * 通过验证 COFACTOR * point = O (无穷远点) 来确保点不在小子群中
 */
export function isInPrimeSubgroup(point: [bigint, bigint]): boolean {
  // 如果点不在曲线上，直接返回 false
  if (!isPointOnCurve(point)) {
    return false;
  }

  // 计算 COFACTOR * point，应该等于单位元 [0, 1]
  const cofactorPoint = mulPoint(point, BABYJUBJUB_COFACTOR);
  return cofactorPoint[0] === 0n && cofactorPoint[1] === 1n;
}

/**
 * 判断一个有限域元素是否字典序较大
 * 根据 gnark-crypto 的实现逻辑，一个元素如果其二进制表示
 * 字典序大于其负数的二进制表示，则认为是"字典序较大"
 * @param x 有限域元素
 * @returns 是否字典序较大
 */
function isLexicographicallyLargest(x: bigint): boolean {
  const p = BABYJUBJUB_SCALAR_FIELD;
  const negX = (p - x) % p;

  // 将两个数转换为字节数组进行比较
  const xBytes = bigIntToFixedBytes(x, 32);
  const negXBytes = bigIntToFixedBytes(negX, 32);

  // 从高位到低位比较（大端序比较）
  for (let i = 31; i >= 0; i--) {
    if (xBytes[i] > negXBytes[i]) return true;
    if (xBytes[i] < negXBytes[i]) return false;
  }

  return false; // 相等的情况
}

/**
 * 椭圆曲线点压缩（gnark-crypto 兼容格式）
 * 将点 (x, y) 压缩为 32 字节：Y坐标 + X坐标符号位
 * 遵循 gnark-crypto 实现和 RFC 8032 标准
 * @param point [x, y] 坐标对
 * @returns 压缩后的字节数组
 */
function compressPoint(point: [bigint, bigint]): Uint8Array {
  const [x, y] = point;

  // 验证点是否在曲线上
  if (!isPointOnCurve(point)) {
    throw new Error('Point is not on the BabyJubjub curve');
  }

  // Y坐标转换为32字节（小端序）
  const compressed = bigIntToFixedBytes(y, 32);

  // 判断X坐标的字典序符号
  if (isLexicographicallyLargest(x)) {
    compressed[31] |= 0x80; // 设置最高位
  } else {
    compressed[31] &= 0x7f; // 清除最高位
  }

  return compressed;
}

/**
 * 椭圆曲线点解压缩（gnark-crypto 兼容格式）
 * 从 32 字节压缩格式恢复点 (x, y)
 * 遵循 gnark-crypto 实现和 RFC 8032 标准
 * @param compressed 压缩的32字节数组
 * @returns [x, y] 坐标对
 */
function decompressPoint(compressed: Uint8Array): [bigint, bigint] {
  if (compressed.length !== 32) {
    throw new Error(`Invalid compressed point length: expected 32 bytes, got ${compressed.length}`);
  }

  // 提取符号位
  const isXLexLargest = (compressed[31] & 0x80) !== 0;

  // 清除符号位，获取Y坐标
  const yBytes = new Uint8Array(compressed);
  yBytes[31] &= 0x7f; // 清除MSB
  const y = fixedBytesToBigInt(yBytes, 32);

  try {
    // 从Y坐标计算X坐标
    const x = recoverXCoordinate(y, isXLexLargest);

    const point: [bigint, bigint] = [x, y];

    // 验证恢复的点是否在曲线上
    if (!isPointOnCurve(point)) {
      throw new Error('Recovered point is not on the BabyJubjub curve');
    }

    return point;
  } catch (error) {
    throw new Error(`Failed to decompress elliptic curve point: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * 从Y坐标恢复X坐标
 * BabyJubjub 曲线方程: ax^2 + y^2 = 1 + dx^2y^2
 * 重新整理按照gnark-crypto的computeX实现: x^2 = (1 - y^2) / (a - dy^2)
 * @param y Y坐标
 * @param isXLexLargest X坐标是否字典序较大
 * @returns X坐标
 */
function recoverXCoordinate(y: bigint, isXLexLargest: boolean): bigint {
  const p = BABYJUBJUB_SCALAR_FIELD;
  const a = BABYJUBJUB_A;
  const d = BABYJUBJUB_D;

  // 计算 y^2 mod p
  const y2 = (y * y) % p;

  // 按照gnark-crypto的computeX实现
  // numerator = 1 - y^2
  const numerator = (1n - y2 + p) % p;

  // denominator = a - d * y^2
  const denominator = (a - ((d * y2) % p) + p) % p;

  // 计算 x^2 = numerator / denominator
  const x2 = (numerator * modInverse(denominator, p)) % p;

  // 计算 x^2 的平方根
  const x = modSqrt(x2, p);

  if (x === null) {
    throw new Error('No square root exists for the given y coordinate');
  }

  // 根据字典序符号选择正确的根
  const xActual = isLexicographicallyLargest(x) === isXLexLargest ? x : (p - x) % p;

  return xActual;
}

/**
 * 从X坐标和奇偶性恢复Y坐标
 * BabyJubjub 曲线方程: ax^2 + y^2 = 1 + dx^2y^2
 * 重新整理: y^2 = (1 - ax^2) / (1 - dx^2)
 * @param x X坐标
 * @param yParity Y坐标的奇偶性 (0 或 1)
 * @returns Y坐标
 */
// function recoverYCoordinate(x: bigint, yParity: number): bigint {
//   const p = BABYJUBJUB_SCALAR_FIELD;
//   const a = BABYJUBJUB_A;
//   const d = BABYJUBJUB_D;

//   // 计算 x^2 mod p
//   const x2 = (x * x) % p;

//   // 计算分子: 1 - ax^2
//   const numerator = (1n - ((a * x2) % p) + p) % p;

//   // 计算分母: 1 - dx^2
//   const denominator = (1n - ((d * x2) % p) + p) % p;

//   // 计算 y^2 = numerator / denominator
//   const y2 = (numerator * modInverse(denominator, p)) % p;

//   // 计算 y^2 的平方根
//   const y = modSqrt(y2, p);

//   if (y === null) {
//     throw new Error('No square root exists for the given x coordinate');
//   }

//   // 根据奇偶性选择正确的根
//   const yActual = (y & 1n) === BigInt(yParity) ? y : (p - y) % p;

//   return yActual;
// }

/**
 * 将 BigInt 转换为固定长度的字节数组（小端序）
 * @param value 要转换的 BigInt
 * @param byteLength 字节长度
 * @returns 字节数组
 */
function bigIntToFixedBytes(value: bigint, byteLength: number): Uint8Array {
  const bytes = new Uint8Array(byteLength);
  let val = value;

  // 小端序：低位字节存储在低地址（数组前面）
  for (let i = 0; i < byteLength; i++) {
    bytes[i] = Number(val & 0xffn);
    val >>= 8n;
  }

  return bytes;
}

/**
 * 从固定长度字节数组转换为 BigInt（小端序）
 * @param bytes 字节数组
 * @param byteLength 字节长度
 * @returns BigInt值
 */
function fixedBytesToBigInt(bytes: Uint8Array, byteLength: number): bigint {
  let result = 0n;

  // 小端序：从低位字节开始读取
  for (let i = 0; i < byteLength; i++) {
    result |= BigInt(bytes[i]) << (BigInt(i) * 8n);
  }

  return result;
}

/**
 * 模平方根计算
 * 使用 Tonelli-Shanks 算法计算 sqrt(n) mod p
 * @param n 被开方数
 * @param p 模数（必须是素数）
 * @returns 平方根，如果不存在则返回 null
 */
function modSqrt(n: bigint, p: bigint): bigint | null {
  // 特殊情况：n = 0
  if (n === 0n) {
    return 0n;
  }

  // 检查是否存在平方根（勒让德符号）
  if (legendre(n, p) !== 1n) {
    return null;
  }

  // 特殊情况：p ≡ 3 (mod 4)
  if (p % 4n === 3n) {
    return modPow(n, (p + 1n) / 4n, p);
  }

  // 一般情况：使用 Tonelli-Shanks 算法
  return tonelliShanks(n, p);
}

/**
 * 勒让德符号计算
 * 计算 (a/p)，判断 a 是否为模 p 的二次剩余
 * @param a 被判断数
 * @param p 模数（奇素数）
 * @returns 1 表示是二次剩余，-1 表示不是，0 表示 a ≡ 0 (mod p)
 */
function legendre(a: bigint, p: bigint): bigint {
  const result = modPow(a, (p - 1n) / 2n, p);
  return result === p - 1n ? -1n : result;
}

/**
 * 快速模幂运算
 * 计算 (base^exponent) mod modulus
 * @param base 底数
 * @param exponent 指数
 * @param modulus 模数
 * @returns 结果
 */
function modPow(base: bigint, exponent: bigint, modulus: bigint): bigint {
  if (modulus === 1n) return 0n;

  let result = 1n;
  let b = base % modulus;
  let e = exponent;

  while (e > 0n) {
    if (e % 2n === 1n) {
      result = (result * b) % modulus;
    }
    e = e / 2n;
    b = (b * b) % modulus;
  }

  return result;
}

/**
 * Tonelli-Shanks 算法计算模平方根
 * @param n 被开方数
 * @param p 模数（奇素数）
 * @returns 平方根
 */
function tonelliShanks(n: bigint, p: bigint): bigint {
  // 找到 Q 和 S 使得 p - 1 = Q * 2^S，其中 Q 是奇数
  let Q = p - 1n;
  let S = 0n;
  while (Q % 2n === 0n) {
    Q = Q / 2n;
    S++;
  }

  // 特殊情况：S = 1
  if (S === 1n) {
    return modPow(n, (p + 1n) / 4n, p);
  }

  // 找到一个二次非剩余 z
  let z = 2n;
  while (legendre(z, p) !== -1n) {
    z++;
  }

  let M = S;
  let c = modPow(z, Q, p);
  let t = modPow(n, Q, p);
  let R = modPow(n, (Q + 1n) / 2n, p);

  while (t !== 1n) {
    // 找到最小的 i 使得 t^(2^i) ≡ 1 (mod p)
    let i = 1n;
    let temp = (t * t) % p;
    while (temp !== 1n && i < M) {
      temp = (temp * temp) % p;
      i++;
    }

    // 更新变量
    const b = modPow(c, modPow(2n, M - i - 1n, p - 1n), p);
    M = i;
    c = (b * b) % p;
    t = (t * c) % p;
    R = (R * b) % p;
  }

  return R;
}

/**
 * 导出 BabyJubjub 相关常量和函数，以便其他模块使用
 */
export const BabyJubjub = {
  SCALAR_FIELD: BABYJUBJUB_SCALAR_FIELD,
  ORDER: BABYJUBJUB_ORDER,
  COFACTOR: BABYJUBJUB_COFACTOR,
  BASE_POINT: BABYJUBJUB_BASE_POINT,
  A: BABYJUBJUB_A,
  D: BABYJUBJUB_D,
  addPoint: babyJubjubPointAdd,
  mulPoint: mulPoint,
  isOnCurve: isPointOnCurve,
  isInPrimeSubgroup: isInPrimeSubgroup,
  scalarMult: babyJubjubScalarMult,
  compressPoint: compressPoint,
  decompressPoint: decompressPoint,
};
