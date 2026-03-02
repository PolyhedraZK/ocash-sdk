//! Memo encryption/decryption using ECDH + NaCl SecretBox (XSalsa20-Poly1305).
//!
//! Flow:
//! 1. Generate ephemeral BabyJubjub keypair
//! 2. ECDH: shared_point = mulPoint(user_pk, ephemeral_sk)
//! 3. shared_key = compressPoint(shared_point) (32 bytes)
//! 4. nonce = keccak256(compress(ephPk) || compress(userPk))[0:24]
//! 5. ciphertext = NaCl secretbox(message, nonce, sharedKey)
//! 6. output = compress(ephPk) || ciphertext

use ark_bn254::Fr;
use ark_ff::PrimeField;
use sha3::{Digest, Keccak256};
use xsalsa20poly1305::{
    aead::{Aead, KeyInit},
    XSalsa20Poly1305, Nonce, Key,
};

use ocash_types::{OcashError, Result};

use crate::babyjubjub;
use crate::record::{self, RecordOpening};

/// Compute the NaCl nonce from ephemeral and user public keys.
///
/// nonce = keccak256(compress(ephPk) || compress(userPk))[0:24]
pub fn memo_nonce(
    eph_pk: (&Fr, &Fr),
    user_pk: (&Fr, &Fr),
) -> Result<[u8; 24]> {
    let eph_compressed = babyjubjub::compress_point(eph_pk.0, eph_pk.1)?;
    let user_compressed = babyjubjub::compress_point(user_pk.0, user_pk.1)?;

    let mut input = [0u8; 64];
    input[0..32].copy_from_slice(&eph_compressed);
    input[32..64].copy_from_slice(&user_compressed);

    let hash = Keccak256::digest(&input);
    let mut nonce = [0u8; 24];
    nonce.copy_from_slice(&hash[0..24]);
    Ok(nonce)
}

/// Create an encrypted memo from a record opening.
///
/// Returns `0x`-prefixed hex: compress(ephPk) || NaCl-secretbox(encoded_record).
pub fn create_memo(ro: &RecordOpening) -> Result<String> {
    let encoded = record::encode(ro)?;

    // Generate ephemeral keypair
    let eph_sk = random_scalar_mod_order();
    let eph_pk = babyjubjub::scalar_mult(&eph_sk);

    // ECDH shared key
    let shared_point = babyjubjub::mul_point(ro.user_pk, &eph_sk);
    let shared_key = babyjubjub::compress_point(&shared_point.0, &shared_point.1)?;

    // Nonce
    let nonce_bytes = memo_nonce(
        (&eph_pk.0, &eph_pk.1),
        (&ro.user_pk.0, &ro.user_pk.1),
    )?;

    // Encrypt
    let cipher = XSalsa20Poly1305::new(Key::from_slice(&shared_key));
    let nonce = Nonce::from_slice(&nonce_bytes);
    let ciphertext = cipher
        .encrypt(nonce, encoded.as_slice())
        .map_err(|e| OcashError::Encryption(e.to_string()))?;

    // Output: compress(ephPk) || ciphertext
    let eph_compressed = babyjubjub::compress_point(&eph_pk.0, &eph_pk.1)?;
    let mut sealed = Vec::with_capacity(32 + ciphertext.len());
    sealed.extend_from_slice(&eph_compressed);
    sealed.extend_from_slice(&ciphertext);

    Ok(format!("0x{}", hex::encode(sealed)))
}

/// Decrypt a memo using the recipient's secret key.
///
/// Returns the decoded record opening, or None if decryption fails.
pub fn decrypt_memo(secret_key: &Fr, encoded: &str) -> Result<Option<RecordOpening>> {
    let hex_str = encoded.strip_prefix("0x").unwrap_or(encoded);
    let payload = hex::decode(hex_str).map_err(|e| OcashError::InvalidHex(e.to_string()))?;

    if payload.len() < 32 + 16 {
        // At minimum: 32 bytes ephPk + 16 bytes MAC
        return Ok(None);
    }

    // Extract ephemeral public key
    let mut eph_compressed = [0u8; 32];
    eph_compressed.copy_from_slice(&payload[0..32]);
    let eph_pk = babyjubjub::decompress_point(&eph_compressed)?;

    let ciphertext = &payload[32..];

    // Compute recipient's public key
    let bob_pk = babyjubjub::scalar_mult(secret_key);

    // ECDH shared key
    let shared_point = babyjubjub::mul_point(eph_pk, secret_key);
    let shared_key = babyjubjub::compress_point(&shared_point.0, &shared_point.1)?;

    // Nonce
    let nonce_bytes = memo_nonce(
        (&eph_pk.0, &eph_pk.1),
        (&bob_pk.0, &bob_pk.1),
    )?;

    // Decrypt
    let cipher = XSalsa20Poly1305::new(Key::from_slice(&shared_key));
    let nonce = Nonce::from_slice(&nonce_bytes);
    match cipher.decrypt(nonce, ciphertext) {
        Ok(plaintext) => {
            let ro = record::decode(&plaintext)?;
            Ok(Some(ro))
        }
        Err(_) => Ok(None),
    }
}

/// Generate a random scalar mod BabyJubjub order.
fn random_scalar_mod_order() -> Fr {
    use rand::RngCore;
    let mut rng = rand::thread_rng();
    let mut bytes = [0u8; 32];
    rng.fill_bytes(&mut bytes);

    // Reduce mod order
    let order = babyjubjub::curve_order();
    let val = Fr::from_le_bytes_mod_order(&bytes);
    // We need mod curve_order, not mod field_prime.
    // Use the bigint_mod approach from keys.rs
    let val_bigint = val.into_bigint();
    let reduced = crate::keys::bigint_mod_order(&val_bigint, &order);
    Fr::from_bigint(reduced).unwrap_or(Fr::from(1u64))
}

#[cfg(test)]
mod tests {
    use super::*;
    use ocash_types::hex_to_field;

    #[test]
    fn test_memo_nonce_vectors_from_json() {
        let data = include_str!("../../../tests/vectors/memo_nonce.json");
        let vectors: Vec<serde_json::Value> = serde_json::from_str(data).unwrap();

        for v in &vectors {
            let eph_pk_x = hex_to_field(v["ephemeral_pk_x"].as_str().unwrap()).unwrap();
            let eph_pk_y = hex_to_field(v["ephemeral_pk_y"].as_str().unwrap()).unwrap();
            let user_pk_x = hex_to_field(v["user_pk_x"].as_str().unwrap()).unwrap();
            let user_pk_y = hex_to_field(v["user_pk_y"].as_str().unwrap()).unwrap();
            let expected = v["expected_nonce"].as_str().unwrap();

            let nonce = memo_nonce(
                (&eph_pk_x, &eph_pk_y),
                (&user_pk_x, &user_pk_y),
            ).unwrap();

            let nonce_hex = format!("0x{}", hex::encode(nonce));
            assert_eq!(
                nonce_hex, expected,
                "memo_nonce mismatch for '{}': got {} expected {}",
                v["name"].as_str().unwrap(),
                nonce_hex,
                expected
            );
        }
    }

    #[test]
    fn test_memo_encrypt_decrypt_roundtrip() {
        let (sk, pk) = crate::keys::derive_key_pair("test-seed-for-memo-roundtrip", None).unwrap();

        let ro = RecordOpening {
            asset_id: Fr::from(1u64),
            asset_amount: Fr::from(1000u64),
            user_pk: pk,
            blinding_factor: Fr::from(42u64),
            is_frozen: false,
        };

        let memo_hex = create_memo(&ro).unwrap();
        let decoded = decrypt_memo(&sk, &memo_hex).unwrap().expect("decrypt should succeed");

        assert_eq!(decoded.asset_id, ro.asset_id);
        assert_eq!(decoded.asset_amount, ro.asset_amount);
        assert_eq!(decoded.user_pk.0, ro.user_pk.0);
        assert_eq!(decoded.user_pk.1, ro.user_pk.1);
        assert_eq!(decoded.blinding_factor, ro.blinding_factor);
        assert_eq!(decoded.is_frozen, ro.is_frozen);
    }
}
