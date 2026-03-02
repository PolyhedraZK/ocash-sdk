//! Sparse Merkle tree using Poseidon2 hashing with Merkle domain separation.
//!
//! - Default depth: 32 (matching the on-chain contract)
//! - Hash: `Poseidon2.hashDomain(left, right, MerkleDomain)`
//! - Zero hashes: pre-computed for levels 0..=32
//! - Optimized: empty subtrees short-circuit to pre-computed zero hashes

use ark_bn254::Fr;
use ocash_crypto::poseidon2::{self, Poseidon2Domain};
use ocash_types::{field_to_hex, hex_to_field, Hex};

pub const TREE_DEPTH_DEFAULT: usize = 32;

/// Pre-computed zero hashes for levels 0..=32.
///
/// zero_hash[0] = 0 (empty leaf)
/// zero_hash[i] = Poseidon2.hash(zero_hash[i-1], zero_hash[i-1], Merkle)
fn zero_hashes() -> Vec<Fr> {
    let mut hashes = Vec::with_capacity(TREE_DEPTH_DEFAULT + 1);
    hashes.push(Fr::from(0u64));
    for _ in 0..TREE_DEPTH_DEFAULT {
        let prev = *hashes.last().unwrap();
        let next = poseidon2::hash_with_domain(prev, prev, Poseidon2Domain::Merkle);
        hashes.push(next);
    }
    hashes
}

/// Get the pre-computed zero hash at a given level.
pub fn get_zero_hash(level: usize) -> Fr {
    let hashes = zero_hashes();
    if level < hashes.len() {
        hashes[level]
    } else {
        Fr::from(0u64)
    }
}

/// A Merkle proof for a single leaf.
#[derive(Debug, Clone)]
pub struct MerkleProof {
    /// The leaf index (cid).
    pub leaf_index: usize,
    /// Path: [leaf_value, sibling_at_level_0, sibling_at_level_1, ..., sibling_at_level_(depth-1)]
    pub path: Vec<Fr>,
}

/// In-memory sparse Merkle tree.
pub struct LocalMerkleTree {
    depth: usize,
    leaves: Vec<Fr>,
    /// Pre-computed zero hashes
    zero_hashes: Vec<Fr>,
}

impl LocalMerkleTree {
    pub fn new(depth: Option<usize>) -> Self {
        let depth = depth.unwrap_or(TREE_DEPTH_DEFAULT).max(1);
        Self {
            depth,
            leaves: Vec::new(),
            zero_hashes: zero_hashes(),
        }
    }

    pub fn leaf_count(&self) -> usize {
        self.leaves.len()
    }

    pub fn latest_cid(&self) -> usize {
        if self.leaves.is_empty() {
            0
        } else {
            self.leaves.len() - 1
        }
    }

    pub fn root(&self) -> Fr {
        self.node(self.depth, 0)
    }

    pub fn root_hex(&self) -> Hex {
        field_to_hex(&self.root())
    }

    /// Append contiguous leaves. Must be sequential starting from current leaf_count.
    pub fn append_leaves(&mut self, input: &[(usize, Fr)]) {
        if input.is_empty() {
            return;
        }
        let mut sorted: Vec<_> = input.to_vec();
        sorted.sort_by_key(|(idx, _)| *idx);

        let mut expected = self.leaves.len();
        for (idx, commitment) in sorted {
            assert_eq!(
                idx, expected,
                "Non-contiguous merkle leaves: expected index={}, got index={}",
                expected, idx
            );
            self.leaves.push(commitment);
            expected += 1;
        }
    }

    /// Append leaves from hex strings.
    pub fn append_leaves_hex(&mut self, input: &[(usize, &str)]) {
        let parsed: Vec<(usize, Fr)> = input
            .iter()
            .map(|(idx, hex)| (*idx, hex_to_field(hex).expect("invalid hex")))
            .collect();
        self.append_leaves(&parsed);
    }

    /// Build Merkle proofs for the given leaf indices (cids).
    pub fn build_proof_by_cids(&self, cids: &[usize]) -> Vec<MerkleProof> {
        assert!(!cids.is_empty(), "Merkle proof requires at least one cid");
        let latest = self.latest_cid();

        cids.iter()
            .map(|&cid| {
                assert!(cid <= latest, "cid out of range: {} > latest_cid={}", cid, latest);
                let mut path = Vec::with_capacity(self.depth + 1);
                let mut pos = cid;

                // First element: the leaf itself
                path.push(self.node(0, pos));

                // Then siblings at each level
                for level in 0..self.depth {
                    let sibling_pos = pos ^ 1;
                    path.push(self.node(level, sibling_pos));
                    pos /= 2;
                }

                MerkleProof {
                    leaf_index: cid,
                    path,
                }
            })
            .collect()
    }

    /// Compute or retrieve a node hash at (level, position).
    ///
    /// Optimized: if the subtree at this position is entirely empty,
    /// returns the pre-computed zero hash for this level.
    fn node(&self, level: usize, position: usize) -> Fr {
        // Leaf level
        if level == 0 {
            return if position < self.leaves.len() {
                self.leaves[position]
            } else {
                self.zero_hashes[0]
            };
        }

        // Empty subtree optimization: the first leaf in this subtree is beyond our data
        let first_leaf_in_subtree = position << level;
        if first_leaf_in_subtree >= self.leaves.len() {
            return self.zero_hashes[level];
        }

        // Compute recursively
        let left = self.node(level - 1, position * 2);
        let right = self.node(level - 1, position * 2 + 1);
        poseidon2::hash_with_domain(left, right, Poseidon2Domain::Merkle)
    }

    /// Verify a Merkle proof against the current root.
    pub fn verify_proof(&self, proof: &MerkleProof) -> bool {
        if proof.path.len() != self.depth + 1 {
            return false;
        }

        let mut current = proof.path[0]; // leaf
        let mut pos = proof.leaf_index;

        for level in 0..self.depth {
            let sibling = proof.path[level + 1];
            if pos % 2 == 0 {
                current = poseidon2::hash_with_domain(current, sibling, Poseidon2Domain::Merkle);
            } else {
                current = poseidon2::hash_with_domain(sibling, current, Poseidon2Domain::Merkle);
            }
            pos /= 2;
        }

        current == self.root()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_zero_hashes_match_ts() {
        let data = include_str!("../../../tests/vectors/merkle.json");
        let vectors: serde_json::Value = serde_json::from_str(data).unwrap();

        let expected_hashes = vectors["zero_hashes"].as_array().unwrap();
        let computed = zero_hashes();

        for (i, expected) in expected_hashes.iter().enumerate() {
            let expected_hex = expected.as_str().unwrap();
            let computed_hex = field_to_hex(&computed[i]);
            assert_eq!(
                computed_hex, expected_hex,
                "zero_hash[{}] mismatch: got {} expected {}",
                i, computed_hex, expected_hex
            );
        }
    }

    #[test]
    fn test_tree_root_and_proofs() {
        let data = include_str!("../../../tests/vectors/merkle.json");
        let vectors: serde_json::Value = serde_json::from_str(data).unwrap();

        let tree_data = &vectors["tree_with_8_leaves"];
        let depth = tree_data["depth"].as_u64().unwrap() as usize;

        let mut tree = LocalMerkleTree::new(Some(depth));

        // Append leaves
        let leaves: Vec<(usize, Fr)> = tree_data["leaves"]
            .as_array()
            .unwrap()
            .iter()
            .map(|l| {
                let idx = l["index"].as_u64().unwrap() as usize;
                let commitment = hex_to_field(l["commitment"].as_str().unwrap()).unwrap();
                (idx, commitment)
            })
            .collect();

        tree.append_leaves(&leaves);

        // Verify root
        let expected_root = tree_data["root"].as_str().unwrap();
        let computed_root = tree.root_hex();
        assert_eq!(computed_root, expected_root, "root mismatch");

        // Verify proof for leaf 0
        let proof0_data = &tree_data["proof_for_leaf_0"];
        let proofs = tree.build_proof_by_cids(&[0]);
        let proof0 = &proofs[0];

        let expected_path: Vec<&str> = proof0_data["path"]
            .as_array()
            .unwrap()
            .iter()
            .map(|v| v.as_str().unwrap())
            .collect();

        assert_eq!(proof0.path.len(), expected_path.len(), "path length mismatch for leaf 0");
        for (i, (computed, expected)) in proof0.path.iter().zip(expected_path.iter()).enumerate() {
            let computed_hex = field_to_hex(computed);
            assert_eq!(
                computed_hex, *expected,
                "path[{}] mismatch for leaf 0: got {} expected {}",
                i, computed_hex, expected
            );
        }

        assert!(tree.verify_proof(proof0), "proof for leaf 0 should verify");

        // Verify proof for leaf 3
        let proof3_data = &tree_data["proof_for_leaf_3"];
        let proofs3 = tree.build_proof_by_cids(&[3]);
        let proof3 = &proofs3[0];

        let expected_path3: Vec<&str> = proof3_data["path"]
            .as_array()
            .unwrap()
            .iter()
            .map(|v| v.as_str().unwrap())
            .collect();

        for (i, (computed, expected)) in proof3.path.iter().zip(expected_path3.iter()).enumerate() {
            let computed_hex = field_to_hex(computed);
            assert_eq!(
                computed_hex, *expected,
                "path[{}] mismatch for leaf 3: got {} expected {}",
                i, computed_hex, expected
            );
        }

        assert!(tree.verify_proof(proof3), "proof for leaf 3 should verify");
    }

    #[test]
    fn test_empty_tree_root() {
        let tree = LocalMerkleTree::new(Some(8));
        let root = tree.root();
        // Empty tree root = zero_hash[depth]
        assert_eq!(root, get_zero_hash(8));
    }

    #[test]
    fn test_depth_32_tree_single_leaf() {
        // Test that depth-32 is tractable with the empty subtree optimization
        let mut tree = LocalMerkleTree::new(Some(32));
        let leaf = Fr::from(42u64);
        tree.append_leaves(&[(0, leaf)]);

        let root = tree.root();
        // Should not hang or crash
        assert_ne!(root, get_zero_hash(32), "root with one leaf should differ from empty root");

        // Proof should verify
        let proofs = tree.build_proof_by_cids(&[0]);
        assert!(tree.verify_proof(&proofs[0]));
    }
}
