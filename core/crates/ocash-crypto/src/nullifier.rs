//! Poseidon2-based nullifier hash.
//!
//! nullifier = Poseidon2.hashDomain(nullifierKey, commitment, Nullifier)
//!
//! Where nullifierKey is either:
//! - The secret key directly (if freezer is identity)
//! - Poseidon2.hashDomain(shared.x, shared.y, KeyDerivation) where shared = ECDH(freezerPk, sk)

use ark_bn254::Fr;
use ocash_types::{field_to_hex, hex_to_field, Hex, Result};

use crate::babyjubjub;
use crate::poseidon2::{self, Poseidon2Domain};

/// Compute a nullifier from secret key and commitment.
///
/// If `freezer_pk` is None or the identity point (0, 1), uses sk directly.
/// Otherwise computes ECDH shared secret with the freezer public key.
pub fn nullifier(
    secret_key: &Fr,
    commitment: &Fr,
    freezer_pk: Option<(Fr, Fr)>,
) -> Fr {
    let (id_x, id_y) = babyjubjub::identity();

    let is_default_freezer = match &freezer_pk {
        None => true,
        Some((fx, fy)) => *fx == id_x && *fy == id_y,
    };

    let nullifier_key = if is_default_freezer {
        *secret_key
    } else {
        let (fx, fy) = freezer_pk.unwrap();
        let shared = babyjubjub::mul_point((fx, fy), secret_key);
        poseidon2::hash_with_domain(shared.0, shared.1, Poseidon2Domain::KeyDerivation)
    };

    poseidon2::hash_with_domain(nullifier_key, *commitment, Poseidon2Domain::Nullifier)
}

/// Compute nullifier from secret key and commitment Fr, returning Fr.
pub fn compute(
    secret_key: &Fr,
    commitment: &Fr,
    freezer_pk: Option<(Fr, Fr)>,
) -> Result<Fr> {
    Ok(nullifier(secret_key, commitment, freezer_pk))
}

/// Compute nullifier and return as 0x-prefixed hex string.
pub fn nullifier_hex(
    secret_key: &Fr,
    commitment_hex: &str,
    freezer_pk: Option<(Fr, Fr)>,
) -> Result<Hex> {
    let commitment = hex_to_field(commitment_hex)?;
    let result = nullifier(secret_key, &commitment, freezer_pk);
    Ok(field_to_hex(&result))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_nullifier_vectors_from_json() {
        let data = include_str!("../../../tests/vectors/nullifier.json");
        let vectors: Vec<serde_json::Value> = serde_json::from_str(data).unwrap();

        for v in &vectors {
            let sk = hex_to_field(v["secret_key"].as_str().unwrap()).unwrap();
            let commitment = hex_to_field(v["commitment"].as_str().unwrap()).unwrap();

            let freezer_pk = v.get("freezer_pk").and_then(|fp| {
                let x = hex_to_field(fp["x"].as_str()?).ok()?;
                let y = hex_to_field(fp["y"].as_str()?).ok()?;
                Some((x, y))
            });

            let expected = v["expected"].as_str().unwrap();
            let result = nullifier(&sk, &commitment, freezer_pk);
            let result_hex = field_to_hex(&result);

            assert_eq!(
                result_hex, expected,
                "Nullifier mismatch for '{}': got {} expected {}",
                v["name"].as_str().unwrap(), result_hex, expected
            );
        }
    }
}
