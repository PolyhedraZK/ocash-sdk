//! BabyJubjub key derivation via HKDF-SHA256.
//!
//! Flow: seed → HKDF-SHA256 → sha256 → scalar mod order → keypair

use ark_bn254::Fr;
use ark_ff::{BigInteger, BigInteger256, PrimeField};
use hkdf::Hkdf;
use sha2::Sha256;
use ocash_types::{OcashError, Result};

use crate::babyjubjub;

const HKDF_INFO: &str = "OCash.KeyGen";

/// Derive a 32-byte seed using HKDF-SHA256.
fn derive_seed(seed: &str, nonce: Option<&str>) -> Result<[u8; 32]> {
    if seed.len() < 16 {
        return Err(OcashError::SeedTooShort);
    }

    let ikm = seed.as_bytes();
    let info = match nonce {
        Some(n) => format!("{}:{}", HKDF_INFO, n),
        None => HKDF_INFO.to_string(),
    };

    // HKDF with no salt (RFC 5869 default: HashLen zeros)
    let hk = Hkdf::<Sha256>::new(None, ikm);
    let mut okm = [0u8; 32];
    hk.expand(info.as_bytes(), &mut okm)
        .map_err(|e| OcashError::KeyDerivation(e.to_string()))?;

    Ok(okm)
}

/// Create a key pair from a derived seed (matches TypeScript `createKeyPairFromSeed`).
///
/// IMPORTANT: The TypeScript code hex-encodes the HKDF output as "0x{hex}" and then
/// passes this string through `toBytes()` from `@noble/hashes/utils` which treats
/// strings as UTF-8 (NOT as hex). So SHA256 is computed over the 66-byte UTF-8
/// representation of the hex string "0xcd7c6e3a...", not the raw 32 bytes.
fn create_key_pair_from_seed(seed_bytes: &[u8; 32]) -> Result<(Fr, (Fr, Fr))> {
    use sha2::Digest;

    // Match TypeScript behavior: hex-encode with "0x" prefix, then SHA256 the UTF-8 string
    let hex_string = format!("0x{}", hex::encode(seed_bytes));
    let seed_hash = Sha256::digest(hex_string.as_bytes());
    let seed_hash_bytes: [u8; 32] = seed_hash.into();

    // Convert hash to bigint (big-endian interpretation, same as TS)
    // Then reduce mod BabyJubjub order
    let order = babyjubjub::curve_order();

    // Convert big-endian bytes to BigInteger256
    let mut le_bytes = seed_hash_bytes;
    le_bytes.reverse();
    let hash_bigint = BigInteger256::new([
        u64::from_le_bytes(le_bytes[0..8].try_into().unwrap()),
        u64::from_le_bytes(le_bytes[8..16].try_into().unwrap()),
        u64::from_le_bytes(le_bytes[16..24].try_into().unwrap()),
        u64::from_le_bytes(le_bytes[24..32].try_into().unwrap()),
    ]);

    // Reduce mod order using long division
    let address_sk = bigint_mod_order(&hash_bigint, &order);
    let sk_fr = Fr::from_bigint(address_sk).unwrap_or(Fr::from(0u64));

    // Compute public key: pk = sk * G
    let (pub_x, pub_y) = babyjubjub::scalar_mult(&sk_fr);

    Ok((sk_fr, (pub_x, pub_y)))
}

/// BigInteger256 modular reduction: a mod m.
pub fn bigint_mod_order(a: &BigInteger256, m: &BigInteger256) -> BigInteger256 {
    // Convert to u128-friendly format for division
    // Since both are 256-bit, we use the ark-ff facilities
    // Simple approach: convert to Fr (which auto-reduces mod p), but we need mod order not mod p.
    // We'll do manual subtraction-based reduction.
    let mut result = *a;
    while result >= *m {
        result.sub_with_borrow(m);
    }
    result
}

/// Derive a key pair from a seed string and optional nonce.
pub fn derive_key_pair(seed: &str, nonce: Option<&str>) -> Result<(Fr, (Fr, Fr))> {
    let derived = derive_seed(seed, nonce)?;
    create_key_pair_from_seed(&derived)
}

/// Get just the secret key scalar from a seed.
pub fn get_secret_key(seed: &str, nonce: Option<&str>) -> Result<Fr> {
    let (sk, _) = derive_key_pair(seed, nonce)?;
    Ok(sk)
}

/// Get just the public key from a seed.
pub fn get_public_key(seed: &str, nonce: Option<&str>) -> Result<(Fr, Fr)> {
    let (_, pk) = derive_key_pair(seed, nonce)?;
    Ok(pk)
}

#[cfg(test)]
mod tests {
    use super::*;
    use ocash_types::field_to_hex;

    #[test]
    fn test_key_derivation_vectors_from_json() {
        let data = include_str!("../../../tests/vectors/key_derivation.json");
        let vectors: Vec<serde_json::Value> = serde_json::from_str(data).unwrap();

        for v in &vectors {
            let seed = v["seed"].as_str().unwrap();
            let nonce = v.get("nonce").and_then(|n| n.as_str());
            let expected_sk = v["expected_sk"].as_str().unwrap();
            let expected_pk_x = v["expected_pk_x"].as_str().unwrap();
            let expected_pk_y = v["expected_pk_y"].as_str().unwrap();

            let (sk, (pk_x, pk_y)) = derive_key_pair(seed, nonce).unwrap();

            let sk_hex = field_to_hex(&sk);
            let pk_x_hex = field_to_hex(&pk_x);
            let pk_y_hex = field_to_hex(&pk_y);

            assert_eq!(
                sk_hex, expected_sk,
                "SK mismatch for '{}': got {} expected {}",
                v["name"].as_str().unwrap(), sk_hex, expected_sk
            );
            assert_eq!(
                pk_x_hex, expected_pk_x,
                "PK.x mismatch for '{}': got {} expected {}",
                v["name"].as_str().unwrap(), pk_x_hex, expected_pk_x
            );
            assert_eq!(
                pk_y_hex, expected_pk_y,
                "PK.y mismatch for '{}': got {} expected {}",
                v["name"].as_str().unwrap(), pk_y_hex, expected_pk_y
            );
        }
    }

    #[test]
    fn test_seed_too_short() {
        let result = derive_key_pair("short", None);
        assert!(result.is_err());
    }
}
