/**
 * Generate cross-language test vectors for the OCash crypto primitives.
 *
 * Run: pnpm tsx scripts/gen-vectors.ts
 *
 * Outputs JSON files in tests/vectors/ that can be consumed by
 * Rust (cargo test), Python (pytest), and other language SDKs
 * to verify bit-for-bit compatibility.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Crypto primitives
import { Poseidon2, Poseidon2Domain } from '../src/crypto/poseidon2';
import { BabyJubjub, BABYJUBJUB_ORDER, createKeyPairFromSeed } from '../src/crypto/babyJubjub';
import { BN254_FIELD_MODULUS } from '../src/crypto/field';
import { CryptoToolkit } from '../src/crypto/cryptoToolkit';
import { KeyManager } from '../src/crypto/keyManager';
import { RecordCodec } from '../src/crypto/recordCodec';
import { MemoKit } from '../src/memo/memoKit';
import { LocalMerkleTree } from '../src/merkle/localMerkleTree';
import { getZeroHash, TREE_DEPTH_DEFAULT } from '../src/merkle/zeroHashes';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const VECTORS_DIR = resolve(__dirname, '../tests/vectors');

mkdirSync(VECTORS_DIR, { recursive: true });

// Helper: bigint → hex string (0x-prefixed, 64 chars)
const toHex = (n: bigint): string => `0x${n.toString(16).padStart(64, '0')}`;

// ─── Poseidon2 ───

function genPoseidon2Vectors() {
  const vectors: Array<{
    name: string;
    a: string;
    b: string;
    domain: string;
    domain_value: string;
    expected: string;
  }> = [];

  // Basic hash (zero domain)
  const cases: Array<[string, bigint, bigint, keyof typeof Poseidon2Domain]> = [
    ['hash(0, 0)', 0n, 0n, 'None'],
    ['hash(1, 2)', 1n, 2n, 'None'],
    ['hash(0, 1)', 0n, 1n, 'None'],
    ['hash(1, 0)', 1n, 0n, 'None'],
    ['hash(p-1, p-1)', BN254_FIELD_MODULUS - 1n, BN254_FIELD_MODULUS - 1n, 'None'],
    ['hash(42, 99)', 42n, 99n, 'None'],
    // Domain-separated
    ['hash_Record(1, 2)', 1n, 2n, 'Record'],
    ['hash_Nullifier(1, 2)', 1n, 2n, 'Nullifier'],
    ['hash_Merkle(1, 2)', 1n, 2n, 'Merkle'],
    ['hash_Policy(1, 2)', 1n, 2n, 'Policy'],
    ['hash_Array(1, 2)', 1n, 2n, 'Array'],
    ['hash_Memo(1, 2)', 1n, 2n, 'Memo'],
    ['hash_Asset(1, 2)', 1n, 2n, 'Asset'],
    ['hash_KeyDerivation(1, 2)', 1n, 2n, 'KeyDerivation'],
    // Larger values
    ['hash_Record(large, large)', 123456789012345678901234567890n, 987654321098765432109876543210n, 'Record'],
  ];

  for (const [name, a, b, domainKey] of cases) {
    const domain = Poseidon2Domain[domainKey];
    const result = Poseidon2.hashDomain(a, b, domain);
    vectors.push({
      name,
      a: toHex(a),
      b: toHex(b),
      domain: domainKey,
      domain_value: toHex(domain),
      expected: toHex(result),
    });
  }

  return vectors;
}

// ─── Poseidon2 hashSequenceWithDomain ───

function genPoseidon2SequenceVectors() {
  const vectors: Array<{
    name: string;
    inputs: string[];
    domain: string;
    seed?: string;
    expected: string;
  }> = [];

  // Single input
  vectors.push({
    name: 'sequence_single(42)',
    inputs: [toHex(42n)],
    domain: 'Record',
    expected: toHex(Poseidon2.hashSequenceWithDomain([42n], Poseidon2Domain.Record)),
  });

  // Two inputs
  vectors.push({
    name: 'sequence_two(1, 2)',
    inputs: [toHex(1n), toHex(2n)],
    domain: 'Record',
    expected: toHex(Poseidon2.hashSequenceWithDomain([1n, 2n], Poseidon2Domain.Record)),
  });

  // Five inputs (commitment-style)
  const fiveInputs = [100n, 200n, 300n, 400n, 500n];
  vectors.push({
    name: 'sequence_five(100..500)',
    inputs: fiveInputs.map(toHex),
    domain: 'Record',
    expected: toHex(Poseidon2.hashSequenceWithDomain(fiveInputs, Poseidon2Domain.Record)),
  });

  // With seed
  const withSeedInputs = [10n, 20n, 30n, 40n];
  const seed = 999n;
  vectors.push({
    name: 'sequence_with_seed(10..40, seed=999)',
    inputs: withSeedInputs.map(toHex),
    domain: 'Policy',
    seed: toHex(seed),
    expected: toHex(Poseidon2.hashSequenceWithDomain(withSeedInputs, Poseidon2Domain.Policy, seed)),
  });

  return vectors;
}

// ─── BabyJubjub ───

function genBabyJubjubVectors() {
  const vectors: {
    constants: {
      field_modulus: string;
      order: string;
      cofactor: number;
      a: string;
      d: string;
      base_point_x: string;
      base_point_y: string;
    };
    scalar_mult: Array<{
      name: string;
      scalar: string;
      expected_x: string;
      expected_y: string;
    }>;
    point_add: Array<{
      name: string;
      p1_x: string;
      p1_y: string;
      p2_x: string;
      p2_y: string;
      expected_x: string;
      expected_y: string;
    }>;
    compress_decompress: Array<{
      name: string;
      x: string;
      y: string;
      compressed: string; // hex of 32 bytes
    }>;
    is_on_curve: Array<{
      name: string;
      x: string;
      y: string;
      expected: boolean;
    }>;
  } = {
    constants: {
      field_modulus: toHex(BN254_FIELD_MODULUS),
      order: toHex(BABYJUBJUB_ORDER),
      cofactor: 8,
      a: toHex(BabyJubjub.A),
      d: toHex(BabyJubjub.D),
      base_point_x: toHex(BabyJubjub.BASE_POINT.x),
      base_point_y: toHex(BabyJubjub.BASE_POINT.y),
    },
    scalar_mult: [],
    point_add: [],
    compress_decompress: [],
    is_on_curve: [],
  };

  // Scalar multiplication
  const scalarCases: Array<[string, bigint]> = [
    ['0*G', 0n],
    ['1*G', 1n],
    ['2*G', 2n],
    ['3*G', 3n],
    ['42*G', 42n],
    ['order-1', BABYJUBJUB_ORDER - 1n],
    ['large_scalar', 123456789012345678901234567890n % BABYJUBJUB_ORDER],
  ];

  for (const [name, scalar] of scalarCases) {
    const [x, y] = BabyJubjub.scalarMult(scalar);
    vectors.scalar_mult.push({
      name,
      scalar: toHex(scalar),
      expected_x: toHex(x),
      expected_y: toHex(y),
    });
  }

  // Point addition
  const p1 = BabyJubjub.scalarMult(5n);
  const p2 = BabyJubjub.scalarMult(7n);
  const sumResult = BabyJubjub.addPoint(p1, p2);
  const expected12G = BabyJubjub.scalarMult(12n);
  vectors.point_add.push({
    name: '5G + 7G = 12G',
    p1_x: toHex(p1[0]),
    p1_y: toHex(p1[1]),
    p2_x: toHex(p2[0]),
    p2_y: toHex(p2[1]),
    expected_x: toHex(sumResult[0]),
    expected_y: toHex(sumResult[1]),
  });

  // identity + P = P
  const identityP = BabyJubjub.addPoint([0n, 1n], p1);
  vectors.point_add.push({
    name: 'O + 5G = 5G',
    p1_x: toHex(0n),
    p1_y: toHex(1n),
    p2_x: toHex(p1[0]),
    p2_y: toHex(p1[1]),
    expected_x: toHex(identityP[0]),
    expected_y: toHex(identityP[1]),
  });

  // Point compression/decompression
  const compressPoints = [
    ['G', BabyJubjub.scalarMult(1n)],
    ['2G', BabyJubjub.scalarMult(2n)],
    ['42G', BabyJubjub.scalarMult(42n)],
    ['large_scalar*G', BabyJubjub.scalarMult(123456789n)],
  ] as const;

  for (const [name, point] of compressPoints) {
    const compressed = BabyJubjub.compressPoint(point as [bigint, bigint]);
    const compressedHex = '0x' + Array.from(compressed).map(b => b.toString(16).padStart(2, '0')).join('');
    vectors.compress_decompress.push({
      name,
      x: toHex(point[0]),
      y: toHex(point[1]),
      compressed: compressedHex,
    });
  }

  // is_on_curve
  vectors.is_on_curve.push(
    { name: 'identity', x: toHex(0n), y: toHex(1n), expected: true },
    { name: 'G', x: toHex(BabyJubjub.BASE_POINT.x), y: toHex(BabyJubjub.BASE_POINT.y), expected: true },
    { name: 'random_invalid', x: toHex(1n), y: toHex(2n), expected: false },
    { name: '42G', x: toHex(BabyJubjub.scalarMult(42n)[0]), y: toHex(BabyJubjub.scalarMult(42n)[1]), expected: true },
  );

  return vectors;
}

// ─── Key Derivation ───

function genKeyDerivationVectors() {
  const vectors: Array<{
    name: string;
    seed: string;
    nonce?: string;
    expected_sk: string;
    expected_pk_x: string;
    expected_pk_y: string;
    expected_address: string;
  }> = [];

  const seeds: Array<[string, string, string | undefined]> = [
    ['basic_seed', 'test-seed-phrase-1234567890', undefined],
    ['with_nonce', 'test-seed-phrase-1234567890', 'account-0'],
    ['another_seed', 'my-secret-ocash-seed-phrase', undefined],
    ['nonce_1', 'my-secret-ocash-seed-phrase', '1'],
    ['unicode_seed', 'this-is-a-unicode-seed-你好世界', undefined],
  ];

  for (const [name, seed, nonce] of seeds) {
    const kp = KeyManager.deriveKeyPair(seed, nonce);
    const address = KeyManager.userPkToAddress(kp.user_pk);
    vectors.push({
      name,
      seed,
      nonce: nonce ?? undefined,
      expected_sk: toHex(kp.user_sk.address_sk),
      expected_pk_x: toHex(kp.user_pk.user_address[0]),
      expected_pk_y: toHex(kp.user_pk.user_address[1]),
      expected_address: address,
    });
  }

  return vectors;
}

// ─── Commitment ───

function genCommitmentVectors() {
  const vectors: Array<{
    name: string;
    record: {
      asset_id: string;
      asset_amount: string;
      user_pk_x: string;
      user_pk_y: string;
      blinding_factor: string;
      is_frozen: boolean;
    };
    expected_hex: string;
    expected_bigint: string;
  }> = [];

  const kp = KeyManager.deriveKeyPair('test-seed-phrase-1234567890');

  const records = [
    {
      name: 'basic_transfer',
      asset_id: 1n,
      asset_amount: 1000n,
      user_pk: kp.user_pk,
      blinding_factor: 12345678901234567890n,
      is_frozen: false,
    },
    {
      name: 'frozen_record',
      asset_id: 2n,
      asset_amount: 500n,
      user_pk: kp.user_pk,
      blinding_factor: 98765432109876543210n,
      is_frozen: true,
    },
    {
      name: 'zero_amount',
      asset_id: 1n,
      asset_amount: 0n,
      user_pk: kp.user_pk,
      blinding_factor: 11111111111111111111n,
      is_frozen: false,
    },
    {
      name: 'large_amount',
      asset_id: 42n,
      asset_amount: (1n << 64n) - 1n,
      user_pk: kp.user_pk,
      blinding_factor: 22222222222222222222n,
      is_frozen: false,
    },
  ];

  for (const r of records) {
    const ro = {
      asset_id: r.asset_id,
      asset_amount: r.asset_amount,
      user_pk: { user_address: r.user_pk.user_address as [bigint, bigint] },
      blinding_factor: r.blinding_factor,
      is_frozen: r.is_frozen,
    };
    const hexResult = CryptoToolkit.commitment(ro, 'hex');
    const bigintResult = CryptoToolkit.commitment(ro, 'bigint');

    vectors.push({
      name: r.name,
      record: {
        asset_id: toHex(r.asset_id),
        asset_amount: toHex(r.asset_amount),
        user_pk_x: toHex(r.user_pk.user_address[0]),
        user_pk_y: toHex(r.user_pk.user_address[1]),
        blinding_factor: toHex(r.blinding_factor),
        is_frozen: r.is_frozen,
      },
      expected_hex: hexResult,
      expected_bigint: toHex(bigintResult),
    });
  }

  return vectors;
}

// ─── Nullifier ───

function genNullifierVectors() {
  const vectors: Array<{
    name: string;
    secret_key: string;
    commitment: string;
    freezer_pk?: { x: string; y: string };
    expected: string;
  }> = [];

  const kp = KeyManager.deriveKeyPair('test-seed-phrase-1234567890');
  const ro = {
    asset_id: 1n,
    asset_amount: 1000n,
    user_pk: { user_address: kp.user_pk.user_address as [bigint, bigint] },
    blinding_factor: 12345678901234567890n,
    is_frozen: false,
  };
  const commitmentHex = CryptoToolkit.commitment(ro, 'hex');

  // Without freezer (default)
  vectors.push({
    name: 'default_freezer',
    secret_key: toHex(kp.user_sk.address_sk),
    commitment: commitmentHex,
    expected: CryptoToolkit.nullifier(kp.user_sk.address_sk, commitmentHex),
  });

  // With identity freezer (0, 1)
  vectors.push({
    name: 'identity_freezer',
    secret_key: toHex(kp.user_sk.address_sk),
    commitment: commitmentHex,
    freezer_pk: { x: toHex(0n), y: toHex(1n) },
    expected: CryptoToolkit.nullifier(kp.user_sk.address_sk, commitmentHex, [0n, 1n]),
  });

  // With actual freezer point
  const freezerKp = KeyManager.deriveKeyPair('freezer-key-phrase-1234567890');
  const freezerPk: [bigint, bigint] = freezerKp.user_pk.user_address;
  vectors.push({
    name: 'custom_freezer',
    secret_key: toHex(kp.user_sk.address_sk),
    commitment: commitmentHex,
    freezer_pk: { x: toHex(freezerPk[0]), y: toHex(freezerPk[1]) },
    expected: CryptoToolkit.nullifier(kp.user_sk.address_sk, commitmentHex, freezerPk),
  });

  return vectors;
}

// ─── Record Codec ───

function genRecordCodecVectors() {
  const vectors: Array<{
    name: string;
    record: {
      asset_id: string;
      asset_amount: string;
      user_pk_x: string;
      user_pk_y: string;
      blinding_factor: string;
      is_frozen: boolean;
    };
    encoded: string;
  }> = [];

  const kp = KeyManager.deriveKeyPair('test-seed-phrase-1234567890');

  const records = [
    { name: 'basic', asset_id: 1n, asset_amount: 1000n, blinding_factor: 12345678901234567890n, is_frozen: false },
    { name: 'frozen', asset_id: 2n, asset_amount: 500n, blinding_factor: 98765432109876543210n, is_frozen: true },
    { name: 'zero', asset_id: 0n, asset_amount: 0n, blinding_factor: 0n, is_frozen: false },
  ];

  for (const r of records) {
    const ro = {
      asset_id: r.asset_id,
      asset_amount: r.asset_amount,
      user_pk: { user_address: kp.user_pk.user_address as [bigint, bigint] },
      blinding_factor: r.blinding_factor,
      is_frozen: r.is_frozen,
    };
    const encoded = RecordCodec.encode(ro);

    vectors.push({
      name: r.name,
      record: {
        asset_id: toHex(r.asset_id),
        asset_amount: toHex(r.asset_amount),
        user_pk_x: toHex(kp.user_pk.user_address[0]),
        user_pk_y: toHex(kp.user_pk.user_address[1]),
        blinding_factor: toHex(r.blinding_factor),
        is_frozen: r.is_frozen,
      },
      encoded,
    });
  }

  return vectors;
}

// ─── Memo Nonce ───

function genMemoNonceVectors() {
  const vectors: Array<{
    name: string;
    ephemeral_pk_x: string;
    ephemeral_pk_y: string;
    user_pk_x: string;
    user_pk_y: string;
    expected_nonce: string; // hex of 24 bytes
  }> = [];

  const kp1 = KeyManager.deriveKeyPair('test-seed-phrase-1234567890');
  const kp2 = KeyManager.deriveKeyPair('another-seed-phrase-abcdef');

  // Use different scalar multiplications as "ephemeral" points
  const ephemeral1 = BabyJubjub.scalarMult(42n);
  const ephemeral2 = BabyJubjub.scalarMult(99n);

  const cases: Array<[string, [bigint, bigint], [bigint, bigint]]> = [
    ['case_1', ephemeral1, kp1.user_pk.user_address],
    ['case_2', ephemeral2, kp1.user_pk.user_address],
    ['case_3', ephemeral1, kp2.user_pk.user_address],
  ];

  for (const [name, ephPk, userPk] of cases) {
    const nonce = MemoKit.memoNonce(ephPk, userPk);
    const nonceHex = '0x' + Array.from(nonce).map(b => b.toString(16).padStart(2, '0')).join('');
    vectors.push({
      name,
      ephemeral_pk_x: toHex(ephPk[0]),
      ephemeral_pk_y: toHex(ephPk[1]),
      user_pk_x: toHex(userPk[0]),
      user_pk_y: toHex(userPk[1]),
      expected_nonce: nonceHex,
    });
  }

  return vectors;
}

// ─── Pool ID ───

function genPoolIdVectors() {
  const vectors: Array<{
    name: string;
    token_address: string;
    viewer_pk_x: string;
    viewer_pk_y: string;
    freezer_pk_x: string;
    freezer_pk_y: string;
    expected: string;
  }> = [];

  const viewerPk: [bigint, bigint] = BabyJubjub.scalarMult(100n);
  const freezerPk: [bigint, bigint] = [0n, 1n]; // identity

  const cases: Array<[string, bigint, [bigint, bigint], [bigint, bigint]]> = [
    ['identity_freezer', 0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdefn, viewerPk, freezerPk],
    ['custom_freezer', 42n, viewerPk, BabyJubjub.scalarMult(200n)],
  ];

  for (const [name, tokenAddr, vPk, fPk] of cases) {
    const result = CryptoToolkit.poolId(tokenAddr, vPk, fPk);
    vectors.push({
      name,
      token_address: toHex(tokenAddr),
      viewer_pk_x: toHex(vPk[0]),
      viewer_pk_y: toHex(vPk[1]),
      freezer_pk_x: toHex(fPk[0]),
      freezer_pk_y: toHex(fPk[1]),
      expected: toHex(result),
    });
  }

  return vectors;
}

// ─── Merkle Tree ───

function genMerkleVectors() {
  // Zero hashes for all 33 levels (from hardcoded TS values)
  const zeroHashes: string[] = [];
  for (let i = 0; i <= TREE_DEPTH_DEFAULT; i++) {
    zeroHashes.push(getZeroHash(i));
  }

  // Build a small tree (depth 8 for fast test vector generation)
  const testDepth = 8;
  const tree = new LocalMerkleTree({ depth: testDepth });

  // Compute commitments (use Poseidon2 hashes as fake commitments)
  const leaves: Array<{ index: number; commitment: string }> = [];
  for (let i = 0; i < 8; i++) {
    const commitment = Poseidon2.hashToHex(BigInt(i + 1), BigInt(i * 100 + 42), Poseidon2Domain.Record);
    leaves.push({ index: i, commitment });
  }

  tree.appendLeaves(leaves);
  const root8 = tree.root;

  // Get proof for leaf 0
  const proof0 = tree.buildProofByCids([0]);
  // Get proof for leaf 3
  const proof3 = tree.buildProofByCids([3]);

  return {
    tree_depth: TREE_DEPTH_DEFAULT,
    test_tree_depth: testDepth,
    zero_hashes: zeroHashes,
    tree_with_8_leaves: {
      depth: testDepth,
      leaves: leaves.map(l => ({ index: l.index, commitment: l.commitment })),
      root: root8,
      proof_for_leaf_0: {
        leaf_index: 0,
        path: proof0.proof[0].path,
        merkle_root: proof0.merkle_root,
      },
      proof_for_leaf_3: {
        leaf_index: 3,
        path: proof3.proof[0].path,
        merkle_root: proof3.merkle_root,
      },
    },
  };
}

// ─── Generate all vectors ───

console.log('Generating cross-language test vectors...\n');

const allVectors = {
  poseidon2: genPoseidon2Vectors(),
  poseidon2_sequence: genPoseidon2SequenceVectors(),
  babyjubjub: genBabyJubjubVectors(),
  key_derivation: genKeyDerivationVectors(),
  commitment: genCommitmentVectors(),
  nullifier: genNullifierVectors(),
  record_codec: genRecordCodecVectors(),
  memo_nonce: genMemoNonceVectors(),
  pool_id: genPoolIdVectors(),
  merkle: genMerkleVectors(),
};

// Write individual files
for (const [name, data] of Object.entries(allVectors)) {
  const filePath = resolve(VECTORS_DIR, `${name}.json`);
  writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
  const count = Array.isArray(data) ? data.length : Object.keys(data).length;
  console.log(`  ${name}.json — ${count} entries`);
}

// Also write a combined file
const combinedPath = resolve(VECTORS_DIR, 'all_vectors.json');
writeFileSync(combinedPath, JSON.stringify(allVectors, null, 2) + '\n');

console.log(`\nAll vectors written to ${VECTORS_DIR}`);
console.log(`Combined file: ${combinedPath}`);
