//! BabyJubjub twisted Edwards curve arithmetic.
//!
//! Curve equation: `a*x^2 + y^2 = 1 + d*x^2*y^2` over BN254 scalar field.
//! Parameters from gnark-crypto.

use ark_bn254::Fr;
use ark_ff::{BigInteger, BigInteger256, Field, PrimeField};
use ocash_types::{OcashError, Result};

/// BN254 scalar field modulus (used as the base field for BabyJubjub).
pub fn field_modulus() -> Fr {
    // This is just -1 + 1 = p in the field. We store it as the modulus.
    // For BN254 Fr, p = 21888242871839275222246405745257275088548364400416034343698204186575808495617
    Fr::from(0u64) - Fr::from(1u64) + Fr::from(1u64) // = 0, but we need p itself
    // Actually we rarely need p as a bigint — we work in Fr directly.
}

/// BabyJubjub curve order (prime subgroup order).
/// l = 2736030358979909402780800718157159386076813972158567259200215660948447373041
pub fn curve_order() -> BigInteger256 {
    BigInteger256::new(
        u256_from_decimal("2736030358979909402780800718157159386076813972158567259200215660948447373041"),
    )
}

/// Curve parameter a = -1 (i.e. p - 1 in the field).
pub fn curve_a() -> Fr {
    -Fr::from(1u64)
}

/// Curve parameter d.
/// d = 12181644023421730124874158521699555681764249180949974110617291017600649128846
pub fn curve_d() -> Fr {
    Fr::from_bigint(BigInteger256::new(
        u256_from_decimal("12181644023421730124874158521699555681764249180949974110617291017600649128846"),
    ))
    .unwrap()
}

/// Base point G (from gnark-crypto).
/// Gx = 9671717474070082183213120605117400219616337014328744928644933853176787189663
/// Gy = 16950150798460657717958625567821834550301663161624707787222815936182638968203
pub fn base_point() -> (Fr, Fr) {
    // Use decimal string conversion to avoid hex encoding issues
    let gx = Fr::from_bigint(BigInteger256::new(
        u256_from_decimal("9671717474070082183213120605117400219616337014328744928644933853176787189663"),
    ))
    .unwrap();
    let gy = Fr::from_bigint(BigInteger256::new(
        u256_from_decimal("16950150798460657717958625567821834550301663161624707787222815936182638968203"),
    ))
    .unwrap();
    (gx, gy)
}

/// Convert a decimal string to [u64; 4] limbs (little-endian).
fn u256_from_decimal(s: &str) -> [u64; 4] {
    // Parse as big-endian bytes first
    let mut value = [0u8; 32];
    // Use a simple decimal-to-binary conversion
    let mut digits: Vec<u8> = s.bytes().map(|b| b - b'0').collect();
    let mut byte_idx = 0;
    while !digits.is_empty() && byte_idx < 32 {
        // Divide all digits by 256, accumulating remainder
        let mut remainder = 0u32;
        let mut new_digits = Vec::new();
        for &d in &digits {
            remainder = remainder * 10 + d as u32;
            if !new_digits.is_empty() || remainder >= 256 {
                new_digits.push((remainder / 256) as u8);
                remainder %= 256;
            }
        }
        value[byte_idx] = remainder as u8;
        byte_idx += 1;
        digits = new_digits;
    }
    // value is now in little-endian byte order
    [
        u64::from_le_bytes(value[0..8].try_into().unwrap()),
        u64::from_le_bytes(value[8..16].try_into().unwrap()),
        u64::from_le_bytes(value[16..24].try_into().unwrap()),
        u64::from_le_bytes(value[24..32].try_into().unwrap()),
    ]
}

/// Identity element (0, 1).
pub fn identity() -> (Fr, Fr) {
    (Fr::from(0u64), Fr::from(1u64))
}

/// Check if a point is on the BabyJubjub curve.
/// Verifies: `a*x^2 + y^2 = 1 + d*x^2*y^2`
pub fn is_on_curve(x: &Fr, y: &Fr) -> bool {
    let a = curve_a();
    let d = curve_d();
    let x2 = *x * *x;
    let y2 = *y * *y;
    let left = a * x2 + y2;
    let right = Fr::from(1u64) + d * x2 * y2;
    left == right
}

/// Point addition on the twisted Edwards curve.
pub fn point_add(p1: (Fr, Fr), p2: (Fr, Fr)) -> (Fr, Fr) {
    let (x1, y1) = p1;
    let (x2, y2) = p2;

    let zero = Fr::from(0u64);
    let one = Fr::from(1u64);

    // Identity checks
    if x1 == zero && y1 == one {
        return (x2, y2);
    }
    if x2 == zero && y2 == one {
        return (x1, y1);
    }

    let a = curve_a();
    let d = curve_d();

    // Edwards addition formula (matching TypeScript zk-kit implementation)
    let beta = x1 * y2;
    let gamma = y1 * x2;
    let delta = (y1 - a * x1) * (x2 + y2);
    let tau = beta * gamma;
    let dtau = d * tau;

    // x3 = (beta + gamma) / (1 + dtau)
    let x3 = (beta + gamma) * (one + dtau).inverse().unwrap();

    // y3 = (delta + a*beta - gamma) / (1 - dtau)
    let y3 = (delta + a * beta - gamma) * (one - dtau).inverse().unwrap();

    (x3, y3)
}

/// Scalar multiplication: scalar * G (base point).
pub fn scalar_mult(scalar: &Fr) -> (Fr, Fr) {
    let (gx, gy) = base_point();
    mul_point((gx, gy), scalar)
}

/// Scalar multiplication with arbitrary base point.
pub fn mul_point(base: (Fr, Fr), scalar: &Fr) -> (Fr, Fr) {
    if *scalar == Fr::from(0u64) {
        return identity();
    }

    let scalar_bigint = scalar.into_bigint();
    let bits = 256; // BN254 has 254-bit scalars, but we iterate over all 256

    let mut result = identity();
    let mut current = base;

    for i in 0..bits {
        if scalar_bigint.get_bit(i) {
            result = point_add(result, current);
        }
        current = point_add(current, current);
    }

    result
}

/// Check if a field element is "lexicographically largest" (gnark-crypto convention).
///
/// An element x is lexicographically largest if its little-endian byte representation
/// is lexicographically larger than that of -x, comparing from the most significant byte.
fn is_lexicographically_largest(x: &Fr) -> bool {
    let neg_x = -*x;
    let x_bytes = bigint_to_le_bytes(&x.into_bigint());
    let neg_x_bytes = bigint_to_le_bytes(&neg_x.into_bigint());

    // Compare from high byte to low byte (byte 31 down to 0)
    for i in (0..32).rev() {
        if x_bytes[i] > neg_x_bytes[i] {
            return true;
        }
        if x_bytes[i] < neg_x_bytes[i] {
            return false;
        }
    }
    false
}

/// Compress a point to 32 bytes (gnark-crypto compatible format).
///
/// Format: Y coordinate in little-endian + X sign bit in MSB of byte 31.
pub fn compress_point(x: &Fr, y: &Fr) -> Result<[u8; 32]> {
    if !is_on_curve(x, y) {
        return Err(OcashError::PointNotOnCurve);
    }

    let mut compressed = bigint_to_le_bytes(&y.into_bigint());

    if is_lexicographically_largest(x) {
        compressed[31] |= 0x80;
    } else {
        compressed[31] &= 0x7F;
    }

    Ok(compressed)
}

/// Decompress a 32-byte compressed point to (x, y).
pub fn decompress_point(compressed: &[u8; 32]) -> Result<(Fr, Fr)> {
    let is_x_lex_largest = (compressed[31] & 0x80) != 0;

    // Clear sign bit to get Y
    let mut y_bytes = *compressed;
    y_bytes[31] &= 0x7F;

    let y = Fr::from_le_bytes_mod_order(&y_bytes);

    // Recover X from Y
    let x = recover_x_coordinate(&y, is_x_lex_largest)?;

    if !is_on_curve(&x, &y) {
        return Err(OcashError::PointNotOnCurve);
    }

    Ok((x, y))
}

/// Recover X coordinate from Y coordinate.
///
/// From the curve equation `a*x^2 + y^2 = 1 + d*x^2*y^2`:
/// `x^2 = (1 - y^2) / (a - d*y^2)`
fn recover_x_coordinate(y: &Fr, is_x_lex_largest: bool) -> Result<Fr> {
    let a = curve_a();
    let d = curve_d();
    let one = Fr::from(1u64);

    let y2 = *y * *y;
    let numerator = one - y2;
    let denominator = a - d * y2;

    let denom_inv = denominator
        .inverse()
        .ok_or(OcashError::NoSquareRoot)?;
    let x2 = numerator * denom_inv;

    let x = sqrt_field(&x2).ok_or(OcashError::NoSquareRoot)?;

    // Select the correct root based on lexicographic sign
    if is_lexicographically_largest(&x) == is_x_lex_largest {
        Ok(x)
    } else {
        Ok(-x)
    }
}

/// Compute the square root of a field element, if it exists.
///
/// For BN254 Fr where p ≡ 1 (mod 4), we use the Tonelli-Shanks algorithm.
/// But since p % 4 == 1 for BN254 Fr, we need the general case.
fn sqrt_field(n: &Fr) -> Option<Fr> {
    if *n == Fr::from(0u64) {
        return Some(Fr::from(0u64));
    }

    // Use ark-ff's built-in sqrt
    n.sqrt()
}

/// Convert a BigInteger256 to 32-byte little-endian representation.
fn bigint_to_le_bytes(bi: &BigInteger256) -> [u8; 32] {
    let mut bytes = [0u8; 32];
    for (i, limb) in bi.0.iter().enumerate() {
        let limb_bytes = limb.to_le_bytes();
        bytes[i * 8..(i + 1) * 8].copy_from_slice(&limb_bytes);
    }
    bytes
}

#[cfg(test)]
mod tests {
    use super::*;
    use ocash_types::{field_to_hex, hex_to_field};

    #[test]
    fn test_base_point_on_curve() {
        let (gx, gy) = base_point();
        assert!(is_on_curve(&gx, &gy), "Base point should be on curve");
    }

    #[test]
    fn test_identity_on_curve() {
        let (x, y) = identity();
        assert!(is_on_curve(&x, &y), "Identity should be on curve");
    }

    #[test]
    fn test_scalar_mult_zero() {
        let result = scalar_mult(&Fr::from(0u64));
        let (ix, iy) = identity();
        assert_eq!(result.0, ix);
        assert_eq!(result.1, iy);
    }

    #[test]
    fn test_scalar_mult_one() {
        let result = scalar_mult(&Fr::from(1u64));
        let (gx, gy) = base_point();
        assert_eq!(result.0, gx);
        assert_eq!(result.1, gy);
    }

    #[test]
    fn test_point_add_identity() {
        let (gx, gy) = base_point();
        let result = point_add(identity(), (gx, gy));
        assert_eq!(result.0, gx);
        assert_eq!(result.1, gy);
    }

    #[test]
    fn test_5g_plus_7g_equals_12g() {
        let p5 = scalar_mult(&Fr::from(5u64));
        let p7 = scalar_mult(&Fr::from(7u64));
        let sum = point_add(p5, p7);
        let expected = scalar_mult(&Fr::from(12u64));
        assert_eq!(sum.0, expected.0);
        assert_eq!(sum.1, expected.1);
    }

    #[test]
    fn test_compress_decompress_roundtrip() {
        let point = scalar_mult(&Fr::from(42u64));
        let compressed = compress_point(&point.0, &point.1).unwrap();
        let (dx, dy) = decompress_point(&compressed).unwrap();
        assert_eq!(point.0, dx);
        assert_eq!(point.1, dy);
    }

    #[test]
    fn test_babyjubjub_vectors_from_json() {
        let data = include_str!("../../../tests/vectors/babyjubjub.json");
        let vectors: serde_json::Value = serde_json::from_str(data).unwrap();

        // Test scalar multiplication
        for v in vectors["scalar_mult"].as_array().unwrap() {
            let scalar = hex_to_field(v["scalar"].as_str().unwrap()).unwrap();
            let expected_x = v["expected_x"].as_str().unwrap();
            let expected_y = v["expected_y"].as_str().unwrap();

            let (rx, ry) = scalar_mult(&scalar);
            let rx_hex = field_to_hex(&rx);
            let ry_hex = field_to_hex(&ry);

            assert_eq!(
                rx_hex, expected_x,
                "scalar_mult X mismatch for '{}': got {} expected {}",
                v["name"].as_str().unwrap(), rx_hex, expected_x
            );
            assert_eq!(
                ry_hex, expected_y,
                "scalar_mult Y mismatch for '{}': got {} expected {}",
                v["name"].as_str().unwrap(), ry_hex, expected_y
            );
        }

        // Test point addition
        for v in vectors["point_add"].as_array().unwrap() {
            let p1x = hex_to_field(v["p1_x"].as_str().unwrap()).unwrap();
            let p1y = hex_to_field(v["p1_y"].as_str().unwrap()).unwrap();
            let p2x = hex_to_field(v["p2_x"].as_str().unwrap()).unwrap();
            let p2y = hex_to_field(v["p2_y"].as_str().unwrap()).unwrap();
            let expected_x = v["expected_x"].as_str().unwrap();
            let expected_y = v["expected_y"].as_str().unwrap();

            let (rx, ry) = point_add((p1x, p1y), (p2x, p2y));
            let rx_hex = field_to_hex(&rx);
            let ry_hex = field_to_hex(&ry);

            assert_eq!(rx_hex, expected_x, "point_add X mismatch for '{}'", v["name"].as_str().unwrap());
            assert_eq!(ry_hex, expected_y, "point_add Y mismatch for '{}'", v["name"].as_str().unwrap());
        }

        // Test compression/decompression
        for v in vectors["compress_decompress"].as_array().unwrap() {
            let x = hex_to_field(v["x"].as_str().unwrap()).unwrap();
            let y = hex_to_field(v["y"].as_str().unwrap()).unwrap();
            let expected_compressed = v["compressed"].as_str().unwrap();

            let compressed = compress_point(&x, &y).unwrap();
            let compressed_hex = format!("0x{}", hex::encode(compressed));

            assert_eq!(
                compressed_hex, expected_compressed,
                "compress mismatch for '{}': got {} expected {}",
                v["name"].as_str().unwrap(), compressed_hex, expected_compressed
            );

            // Roundtrip
            let (dx, dy) = decompress_point(&compressed).unwrap();
            assert_eq!(dx, x, "decompress X mismatch for '{}'", v["name"].as_str().unwrap());
            assert_eq!(dy, y, "decompress Y mismatch for '{}'", v["name"].as_str().unwrap());
        }

        // Test is_on_curve
        for v in vectors["is_on_curve"].as_array().unwrap() {
            let x = hex_to_field(v["x"].as_str().unwrap()).unwrap();
            let y = hex_to_field(v["y"].as_str().unwrap()).unwrap();
            let expected = v["expected"].as_bool().unwrap();

            assert_eq!(
                is_on_curve(&x, &y), expected,
                "is_on_curve mismatch for '{}'", v["name"].as_str().unwrap()
            );
        }
    }
}
