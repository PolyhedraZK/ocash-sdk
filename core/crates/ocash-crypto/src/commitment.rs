//! Poseidon2-based commitment hash.
//!
//! commitment = Poseidon2.hashSequenceWithDomain(
//!     [pk.x, pk.y, blinding_factor, asset_id, amount_with_frozen_bit],
//!     Record
//! )

use ark_bn254::Fr;
use ark_ff::PrimeField;
use ocash_types::{field_to_hex, Hex};

use crate::poseidon2::{self, Poseidon2Domain};
use crate::record::RecordOpening;

/// Compute a commitment hash from record opening fields.
pub fn commitment(
    user_pk_x: &Fr,
    user_pk_y: &Fr,
    blinding_factor: &Fr,
    asset_id: &Fr,
    asset_amount: &Fr,
    is_frozen: bool,
) -> Fr {
    let mut amount = *asset_amount;
    if is_frozen {
        // Set bit 128: amount |= (1 << 128)
        let frozen_bit = Fr::from_bigint(ark_ff::BigInteger256::new([0, 0, 1, 0])).unwrap();
        amount += frozen_bit;
    }

    let inputs = [*user_pk_x, *user_pk_y, *blinding_factor, *asset_id, amount];
    poseidon2::hash_sequence_with_domain(&inputs, Poseidon2Domain::Record.value(), None)
}

/// Compute commitment and return as 0x-prefixed hex string.
pub fn commitment_hex(
    user_pk_x: &Fr,
    user_pk_y: &Fr,
    blinding_factor: &Fr,
    asset_id: &Fr,
    asset_amount: &Fr,
    is_frozen: bool,
) -> Hex {
    let h = commitment(user_pk_x, user_pk_y, blinding_factor, asset_id, asset_amount, is_frozen);
    field_to_hex(&h)
}

/// Compute commitment from a RecordOpening.
pub fn compute(ro: &RecordOpening) -> ocash_types::Result<Fr> {
    Ok(commitment(
        &ro.user_pk.0,
        &ro.user_pk.1,
        &ro.blinding_factor,
        &ro.asset_id,
        &ro.asset_amount,
        ro.is_frozen,
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use ocash_types::hex_to_field;

    #[test]
    fn test_commitment_vectors_from_json() {
        let data = include_str!("../../../tests/vectors/commitment.json");
        let vectors: Vec<serde_json::Value> = serde_json::from_str(data).unwrap();

        for v in &vectors {
            let record = &v["record"];
            let pk_x = hex_to_field(record["user_pk_x"].as_str().unwrap()).unwrap();
            let pk_y = hex_to_field(record["user_pk_y"].as_str().unwrap()).unwrap();
            let blinding = hex_to_field(record["blinding_factor"].as_str().unwrap()).unwrap();
            let asset_id = hex_to_field(record["asset_id"].as_str().unwrap()).unwrap();
            let amount = hex_to_field(record["asset_amount"].as_str().unwrap()).unwrap();
            let is_frozen = record["is_frozen"].as_bool().unwrap();
            let expected_hex = v["expected_hex"].as_str().unwrap();

            let result = commitment_hex(&pk_x, &pk_y, &blinding, &asset_id, &amount, is_frozen);

            assert_eq!(
                result, expected_hex,
                "Commitment mismatch for '{}': got {} expected {}",
                v["name"].as_str().unwrap(), result, expected_hex
            );
        }
    }
}
