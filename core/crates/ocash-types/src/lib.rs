use ark_bn254::Fr;
use ark_ff::{BigInteger, PrimeField};
use serde::{Deserialize, Serialize};
use thiserror::Error;

/// BN254 scalar field element type alias.
pub type FieldElement = Fr;

/// 0x-prefixed hex string (e.g. "0x1234...").
pub type Hex = String;

/// OCash SDK error types.
#[derive(Debug, Error)]
pub enum OcashError {
    #[error("invalid hex string: {0}")]
    InvalidHex(String),

    #[error("point not on curve")]
    PointNotOnCurve,

    #[error("invalid compressed point: {0}")]
    InvalidCompressedPoint(String),

    #[error("no modular square root exists")]
    NoSquareRoot,

    #[error("key derivation failed: {0}")]
    KeyDerivation(String),

    #[error("seed too short: minimum 16 characters required")]
    SeedTooShort,

    #[error("invalid key pair")]
    InvalidKeyPair,

    #[error("encryption failed: {0}")]
    Encryption(String),

    #[error("decryption failed")]
    DecryptionFailed,

    #[error("{0}")]
    Other(String),
}

pub type Result<T> = std::result::Result<T, OcashError>;

/// A point on the BabyJubjub curve (x, y).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Point {
    pub x: String, // hex-encoded field element
    pub y: String,
}

/// User public key.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct UserPublicKey {
    pub user_address: [String; 2], // [x_hex, y_hex]
}

/// User secret key (includes public key).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserSecretKey {
    pub address_sk: String, // hex-encoded scalar
}

/// User key pair.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserKeyPair {
    pub user_pk: UserPublicKey,
    pub user_sk: UserSecretKey,
}

/// Record opening / commitment data.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommitmentData {
    pub asset_id: String,      // hex-encoded
    pub asset_amount: String,  // hex-encoded
    pub user_pk_x: String,     // hex-encoded
    pub user_pk_y: String,     // hex-encoded
    pub blinding_factor: String, // hex-encoded
    pub is_frozen: bool,
}

/// Parse a 0x-prefixed hex string into a field element.
pub fn hex_to_field(hex_str: &str) -> Result<Fr> {
    let hex_str = hex_str.strip_prefix("0x").unwrap_or(hex_str);
    let bytes = hex::decode(hex_str).map_err(|e| OcashError::InvalidHex(e.to_string()))?;
    // Convert big-endian bytes to field element
    let mut padded = [0u8; 32];
    let offset = 32usize.saturating_sub(bytes.len());
    padded[offset..].copy_from_slice(&bytes);
    // ark-ff uses little-endian representation internally
    padded.reverse();
    Ok(Fr::from_le_bytes_mod_order(&padded))
}

/// Convert a field element to a 0x-prefixed hex string (64 chars).
pub fn field_to_hex(f: &Fr) -> String {
    let bytes = f.into_bigint().to_bytes_be();
    format!("0x{}", hex::encode(bytes))
}

/// Parse a hex string to a big-endian byte array.
pub fn hex_to_bytes(hex_str: &str) -> Result<Vec<u8>> {
    let hex_str = hex_str.strip_prefix("0x").unwrap_or(hex_str);
    hex::decode(hex_str).map_err(|e| OcashError::InvalidHex(e.to_string()))
}

/// Convert bytes to a 0x-prefixed hex string.
pub fn bytes_to_hex(bytes: &[u8]) -> String {
    format!("0x{}", hex::encode(bytes))
}
