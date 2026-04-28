//! Record opening codec (ABI-style encoding/decoding).
//!
//! Format: 5 × 32-byte uint256 slots (160 bytes total):
//!   [asset_id, asset_amount, compressed_pk, blinding_factor, is_frozen(0/1)]
//!
//! The compressed public key is the BabyJubjub point compression bytes
//! interpreted as a uint256 (LE bytes → toHex → BigInt → ABI uint256).

use ark_bn254::Fr;
use ark_ff::{BigInteger, PrimeField};
use ocash_types::{OcashError, Result};

use crate::babyjubjub;

/// A decoded record opening.
#[derive(Debug, Clone)]
pub struct RecordOpening {
    pub asset_id: Fr,
    pub asset_amount: Fr,
    pub user_pk: (Fr, Fr),
    pub blinding_factor: Fr,
    pub is_frozen: bool,
}

/// Encode a record opening to ABI-style bytes (160 bytes).
pub fn encode(ro: &RecordOpening) -> Result<Vec<u8>> {
    let compressed = babyjubjub::compress_point(&ro.user_pk.0, &ro.user_pk.1)?;

    let mut result = Vec::with_capacity(160);
    result.extend_from_slice(&field_to_be_bytes(&ro.asset_id));
    result.extend_from_slice(&field_to_be_bytes(&ro.asset_amount));
    // Compressed point: LE bytes are treated as-is for the uint256 slot
    // (TS does BigInt(toHex(compressedBytes)) → ABI encode → same byte order)
    result.extend_from_slice(&compressed);
    result.extend_from_slice(&field_to_be_bytes(&ro.blinding_factor));
    let mut frozen_slot = [0u8; 32];
    if ro.is_frozen {
        frozen_slot[31] = 1;
    }
    result.extend_from_slice(&frozen_slot);

    Ok(result)
}

/// Encode a record opening to a 0x-prefixed hex string.
pub fn encode_hex(ro: &RecordOpening) -> Result<String> {
    let bytes = encode(ro)?;
    Ok(format!("0x{}", hex::encode(bytes)))
}

/// Decode ABI-style bytes (160 bytes) to a record opening.
pub fn decode(data: &[u8]) -> Result<RecordOpening> {
    if data.len() != 160 {
        return Err(OcashError::Other(format!(
            "record data must be 160 bytes, got {}",
            data.len()
        )));
    }

    let asset_id = be_bytes_to_field(&data[0..32]);
    let asset_amount = be_bytes_to_field(&data[32..64]);

    // Compressed point slot: raw bytes are the LE compressed point
    let mut compressed = [0u8; 32];
    compressed.copy_from_slice(&data[64..96]);
    let (pk_x, pk_y) = babyjubjub::decompress_point(&compressed)?;

    let blinding_factor = be_bytes_to_field(&data[96..128]);
    let is_frozen = data[159] == 1;

    Ok(RecordOpening {
        asset_id,
        asset_amount,
        user_pk: (pk_x, pk_y),
        blinding_factor,
        is_frozen,
    })
}

/// Decode a 0x-prefixed hex string to a record opening.
pub fn decode_hex(hex_str: &str) -> Result<RecordOpening> {
    let hex_str = hex_str.strip_prefix("0x").unwrap_or(hex_str);
    let bytes = hex::decode(hex_str).map_err(|e| OcashError::InvalidHex(e.to_string()))?;
    decode(&bytes)
}

/// Convert a field element to 32-byte big-endian representation.
fn field_to_be_bytes(f: &Fr) -> [u8; 32] {
    let bytes = f.into_bigint().to_bytes_be();
    let mut result = [0u8; 32];
    let offset = 32usize.saturating_sub(bytes.len());
    result[offset..].copy_from_slice(&bytes[..]);
    result
}

/// Convert 32-byte big-endian data to a field element.
fn be_bytes_to_field(data: &[u8]) -> Fr {
    let mut padded = [0u8; 32];
    let offset = 32usize.saturating_sub(data.len());
    padded[offset..].copy_from_slice(data);
    padded.reverse(); // BE to LE
    Fr::from_le_bytes_mod_order(&padded)
}

#[cfg(test)]
mod tests {
    use super::*;
    use ocash_types::hex_to_field;

    #[test]
    fn test_record_codec_vectors_from_json() {
        let data = include_str!("../../../tests/vectors/record_codec.json");
        let vectors: Vec<serde_json::Value> = serde_json::from_str(data).unwrap();

        for v in &vectors {
            let rec = &v["record"];
            let ro = RecordOpening {
                asset_id: hex_to_field(rec["asset_id"].as_str().unwrap()).unwrap(),
                asset_amount: hex_to_field(rec["asset_amount"].as_str().unwrap()).unwrap(),
                user_pk: (
                    hex_to_field(rec["user_pk_x"].as_str().unwrap()).unwrap(),
                    hex_to_field(rec["user_pk_y"].as_str().unwrap()).unwrap(),
                ),
                blinding_factor: hex_to_field(rec["blinding_factor"].as_str().unwrap()).unwrap(),
                is_frozen: rec["is_frozen"].as_bool().unwrap(),
            };

            let expected = v["encoded"].as_str().unwrap();
            let encoded = encode_hex(&ro).unwrap();
            assert_eq!(
                encoded, expected,
                "encode mismatch for '{}': got {} expected {}",
                v["name"].as_str().unwrap(),
                encoded,
                expected
            );

            // Roundtrip decode
            let decoded = decode_hex(&encoded).unwrap();
            assert_eq!(decoded.asset_id, ro.asset_id, "asset_id roundtrip mismatch");
            assert_eq!(decoded.asset_amount, ro.asset_amount, "asset_amount roundtrip mismatch");
            assert_eq!(decoded.user_pk.0, ro.user_pk.0, "pk_x roundtrip mismatch");
            assert_eq!(decoded.user_pk.1, ro.user_pk.1, "pk_y roundtrip mismatch");
            assert_eq!(decoded.blinding_factor, ro.blinding_factor, "blinding roundtrip mismatch");
            assert_eq!(decoded.is_frozen, ro.is_frozen, "is_frozen roundtrip mismatch");
        }
    }
}
