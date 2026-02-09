use pyo3::prelude::*;
use pyo3::exceptions::PyValueError;
use ark_bn254::Fr;

use ocash_types::{field_to_hex, hex_to_field};
use ocash_crypto::{
    poseidon2::{self, Poseidon2Domain},
    babyjubjub, keys,
    commitment as commitment_mod,
    nullifier as nullifier_mod,
    memo,
    record::{self, RecordOpening},
};

/// Helper: parse hex string to Fr, raising Python ValueError on failure.
fn parse_hex(s: &str) -> PyResult<Fr> {
    hex_to_field(s).map_err(|e| PyValueError::new_err(format!("invalid hex: {e}")))
}

/// Helper: convert RecordOpening dict → Rust struct.
fn dict_to_ro(dict: &Bound<'_, PyAny>) -> PyResult<RecordOpening> {
    let asset_id: String = dict.get_item("asset_id")?.extract()?;
    let asset_amount: String = dict.get_item("asset_amount")?.extract()?;
    let user_pk_x: String = dict.get_item("user_pk_x")?.extract()?;
    let user_pk_y: String = dict.get_item("user_pk_y")?.extract()?;
    let blinding_factor: String = dict.get_item("blinding_factor")?.extract()?;
    let is_frozen: bool = dict.get_item("is_frozen")?.extract()?;

    Ok(RecordOpening {
        asset_id: parse_hex(&asset_id)?,
        asset_amount: parse_hex(&asset_amount)?,
        user_pk: (parse_hex(&user_pk_x)?, parse_hex(&user_pk_y)?),
        blinding_factor: parse_hex(&blinding_factor)?,
        is_frozen,
    })
}

/// Helper: convert RecordOpening → Python dict.
fn ro_to_dict(py: Python<'_>, ro: &RecordOpening) -> PyResult<PyObject> {
    let dict = pyo3::types::PyDict::new(py);
    dict.set_item("asset_id", field_to_hex(&ro.asset_id))?;
    dict.set_item("asset_amount", field_to_hex(&ro.asset_amount))?;
    dict.set_item("user_pk_x", field_to_hex(&ro.user_pk.0))?;
    dict.set_item("user_pk_y", field_to_hex(&ro.user_pk.1))?;
    dict.set_item("blinding_factor", field_to_hex(&ro.blinding_factor))?;
    dict.set_item("is_frozen", ro.is_frozen)?;
    Ok(dict.into())
}

#[pyfunction]
fn poseidon2_hash(a: &str, b: &str, domain: &str) -> PyResult<String> {
    let fa = parse_hex(a)?;
    let fb = parse_hex(b)?;
    let dom = Poseidon2Domain::from_name(domain)
        .ok_or_else(|| PyValueError::new_err(format!("unknown domain: {domain}")))?;
    let result = poseidon2::hash_with_domain(fa, fb, dom);
    Ok(field_to_hex(&result))
}

#[pyfunction]
#[pyo3(signature = (inputs, domain, seed=None))]
fn poseidon2_hash_sequence(inputs: Vec<String>, domain: &str, seed: Option<&str>) -> PyResult<String> {
    let fields: Vec<Fr> = inputs.iter().map(|s| parse_hex(s)).collect::<PyResult<_>>()?;
    let dom = parse_hex(domain)?;
    let seed_fr = seed.map(|s| parse_hex(s)).transpose()?;
    let result = poseidon2::hash_sequence_with_domain(&fields, dom, seed_fr);
    Ok(field_to_hex(&result))
}

#[pyfunction]
#[pyo3(signature = (seed, nonce=None))]
fn derive_key_pair(py: Python<'_>, seed: &str, nonce: Option<&str>) -> PyResult<PyObject> {
    let (sk, pk) = keys::derive_key_pair(seed, nonce)
        .map_err(|e| PyValueError::new_err(e.to_string()))?;
    let dict = pyo3::types::PyDict::new(py);
    dict.set_item("secret_key", field_to_hex(&sk))?;
    dict.set_item("public_key_x", field_to_hex(&pk.0))?;
    dict.set_item("public_key_y", field_to_hex(&pk.1))?;
    Ok(dict.into())
}

#[pyfunction]
#[pyo3(signature = (seed, nonce=None))]
fn get_public_key(py: Python<'_>, seed: &str, nonce: Option<&str>) -> PyResult<PyObject> {
    let pk = keys::get_public_key(seed, nonce)
        .map_err(|e| PyValueError::new_err(e.to_string()))?;
    let dict = pyo3::types::PyDict::new(py);
    dict.set_item("x", field_to_hex(&pk.0))?;
    dict.set_item("y", field_to_hex(&pk.1))?;
    Ok(dict.into())
}

#[pyfunction]
#[pyo3(name = "commitment")]
fn py_commitment(
    pk_x: &str, pk_y: &str, blinding_factor: &str,
    asset_id: &str, amount: &str, is_frozen: bool,
) -> PyResult<String> {
    let result = commitment_mod::commitment(
        &parse_hex(pk_x)?,
        &parse_hex(pk_y)?,
        &parse_hex(blinding_factor)?,
        &parse_hex(asset_id)?,
        &parse_hex(amount)?,
        is_frozen,
    );
    Ok(field_to_hex(&result))
}

#[pyfunction]
#[pyo3(name = "nullifier", signature = (secret_key, commitment_hex, freezer_pk_x=None, freezer_pk_y=None))]
fn py_nullifier(
    secret_key: &str, commitment_hex: &str,
    freezer_pk_x: Option<&str>, freezer_pk_y: Option<&str>,
) -> PyResult<String> {
    let sk = parse_hex(secret_key)?;
    let commit = parse_hex(commitment_hex)?;
    let freezer = match (freezer_pk_x, freezer_pk_y) {
        (Some(fx), Some(fy)) => Some((parse_hex(fx)?, parse_hex(fy)?)),
        _ => None,
    };
    let result = nullifier_mod::nullifier(&sk, &commit, freezer);
    Ok(field_to_hex(&result))
}

#[pyfunction]
fn babyjubjub_mul_point(py: Python<'_>, base_x: &str, base_y: &str, scalar: &str) -> PyResult<PyObject> {
    let base = (parse_hex(base_x)?, parse_hex(base_y)?);
    let s = parse_hex(scalar)?;
    let result = babyjubjub::mul_point(base, &s);
    let dict = pyo3::types::PyDict::new(py);
    dict.set_item("x", field_to_hex(&result.0))?;
    dict.set_item("y", field_to_hex(&result.1))?;
    Ok(dict.into())
}

#[pyfunction]
fn babyjubjub_compress(x: &str, y: &str) -> PyResult<String> {
    let compressed = babyjubjub::compress_point(&parse_hex(x)?, &parse_hex(y)?)
        .map_err(|e| PyValueError::new_err(e.to_string()))?;
    Ok(format!("0x{}", hex::encode(compressed)))
}

#[pyfunction]
fn babyjubjub_decompress(py: Python<'_>, compressed: &str) -> PyResult<PyObject> {
    let hex_str = compressed.strip_prefix("0x").unwrap_or(compressed);
    let bytes = hex::decode(hex_str)
        .map_err(|e| PyValueError::new_err(format!("invalid hex: {e}")))?;
    if bytes.len() != 32 {
        return Err(PyValueError::new_err("compressed point must be 32 bytes"));
    }
    let mut arr = [0u8; 32];
    arr.copy_from_slice(&bytes);
    let (x, y) = babyjubjub::decompress_point(&arr)
        .map_err(|e| PyValueError::new_err(e.to_string()))?;
    let dict = pyo3::types::PyDict::new(py);
    dict.set_item("x", field_to_hex(&x))?;
    dict.set_item("y", field_to_hex(&y))?;
    Ok(dict.into())
}

#[pyfunction]
fn record_encode(record: &Bound<'_, PyAny>) -> PyResult<String> {
    let ro = dict_to_ro(record)?;
    record::encode_hex(&ro).map_err(|e| PyValueError::new_err(e.to_string()))
}

#[pyfunction]
fn record_decode(py: Python<'_>, hex_str: &str) -> PyResult<PyObject> {
    let ro = record::decode_hex(hex_str)
        .map_err(|e| PyValueError::new_err(e.to_string()))?;
    ro_to_dict(py, &ro)
}

#[pyfunction]
fn memo_create(record: &Bound<'_, PyAny>) -> PyResult<String> {
    let ro = dict_to_ro(record)?;
    memo::create_memo(&ro).map_err(|e| PyValueError::new_err(e.to_string()))
}

#[pyfunction]
fn memo_decrypt(py: Python<'_>, secret_key: &str, encoded: &str) -> PyResult<Option<PyObject>> {
    let sk = parse_hex(secret_key)?;
    match memo::decrypt_memo(&sk, encoded) {
        Ok(Some(ro)) => Ok(Some(ro_to_dict(py, &ro)?)),
        Ok(None) => Ok(None),
        Err(e) => Err(PyValueError::new_err(e.to_string())),
    }
}

#[pyfunction]
fn memo_nonce(eph_pk_x: &str, eph_pk_y: &str, user_pk_x: &str, user_pk_y: &str) -> PyResult<String> {
    let nonce = memo::memo_nonce(
        (&parse_hex(eph_pk_x)?, &parse_hex(eph_pk_y)?),
        (&parse_hex(user_pk_x)?, &parse_hex(user_pk_y)?),
    ).map_err(|e| PyValueError::new_err(e.to_string()))?;
    Ok(format!("0x{}", hex::encode(nonce)))
}

#[pymodule]
fn _native(m: &Bound<'_, PyModule>) -> PyResult<()> {
    m.add_function(wrap_pyfunction!(poseidon2_hash, m)?)?;
    m.add_function(wrap_pyfunction!(poseidon2_hash_sequence, m)?)?;
    m.add_function(wrap_pyfunction!(derive_key_pair, m)?)?;
    m.add_function(wrap_pyfunction!(get_public_key, m)?)?;
    m.add_function(wrap_pyfunction!(py_commitment, m)?)?;
    m.add_function(wrap_pyfunction!(py_nullifier, m)?)?;
    m.add_function(wrap_pyfunction!(babyjubjub_mul_point, m)?)?;
    m.add_function(wrap_pyfunction!(babyjubjub_compress, m)?)?;
    m.add_function(wrap_pyfunction!(babyjubjub_decompress, m)?)?;
    m.add_function(wrap_pyfunction!(record_encode, m)?)?;
    m.add_function(wrap_pyfunction!(record_decode, m)?)?;
    m.add_function(wrap_pyfunction!(memo_create, m)?)?;
    m.add_function(wrap_pyfunction!(memo_decrypt, m)?)?;
    m.add_function(wrap_pyfunction!(memo_nonce, m)?)?;
    Ok(())
}
