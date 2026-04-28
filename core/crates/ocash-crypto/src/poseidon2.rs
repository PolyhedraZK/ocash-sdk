//! Poseidon2 hash implementation (t=3, rate=2, capacity=1) for the BN254 scalar field.
//!
//! Mirrors the TypeScript/Solidity implementation with identical round constants
//! from gnark-crypto.

use ark_bn254::Fr;
use ark_ff::PrimeField;

/// Domain constants for domain-separated hashing.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Poseidon2Domain {
    None,
    Record,
    Nullifier,
    Merkle,
    Policy,
    Array,
    Memo,
    Asset,
    KeyDerivation,
}

impl Poseidon2Domain {
    pub fn value(&self) -> Fr {
        let v: u64 = match self {
            Self::None => 0x0000000000000000,
            Self::Record => 0x5245434f52440000,     // "RECORD"
            Self::Nullifier => 0x4e554c4c49464945, // "NULLIFIE"
            Self::Merkle => 0x4d45524b4c450000,     // "MERKLE"
            Self::Policy => 0x504f4c4943590000,     // "POLICY"
            Self::Array => 0x4152524159000000,       // "ARRAY"
            Self::Memo => 0x4d454d4f00000000,       // "MEMO"
            Self::Asset => 0x4153534554000000,       // "ASSET"
            Self::KeyDerivation => 0x4b45594445520000, // "KEYDER"
        };
        Fr::from(v)
    }

    pub fn from_name(name: &str) -> Option<Self> {
        match name {
            "None" => Some(Self::None),
            "Record" => Some(Self::Record),
            "Nullifier" => Some(Self::Nullifier),
            "Merkle" => Some(Self::Merkle),
            "Policy" => Some(Self::Policy),
            "Array" => Some(Self::Array),
            "Memo" => Some(Self::Memo),
            "Asset" => Some(Self::Asset),
            "KeyDerivation" => Some(Self::KeyDerivation),
            _ => None,
        }
    }
}

/// Parse a hex constant into a field element.
/// Accepts hex strings WITHOUT 0x prefix. Pads to even length if needed.
fn hex_const(s: &str) -> Fr {
    // Pad to even length if needed
    let padded_hex = if s.len() % 2 != 0 {
        format!("0{}", s)
    } else {
        s.to_string()
    };
    let bytes = hex::decode(&padded_hex).expect("invalid hex constant");
    let mut padded = [0u8; 32];
    let offset = 32 - bytes.len();
    padded[offset..].copy_from_slice(&bytes);
    padded.reverse(); // big-endian to little-endian
    Fr::from_le_bytes_mod_order(&padded)
}

/// Full round keys (start): 4 tuples of [c0, c1, c2]
fn full_round_keys_start() -> [[Fr; 3]; 4] {
    [
        [
            hex_const("2ba117aea05b03e08d3e8cdc3441e489710b7eae2127240261f1161a4c375ec3"),
            hex_const("13d62b66e9d5236b1c4349076bc462097eca577bcd980e3e5262986898001a95"),
            hex_const("2ceb56ddb7d8c8886771c2f12a458edd58886a852e29ea9a157cb6c3ba8201a2"),
        ],
        [
            hex_const("0ba9383b6a5ba188031f7377b152f8df895115269e8437f9eccdc767ecaf458f"),
            hex_const("188b8a2dd4baa4aeda8cf74c2cb3f5dfa482de9987f03fdeafd832f6c3be19c6"),
            hex_const("2672744cbbe045c930be1dcaae5b38cf4f0b9673514cbe5129908164ef7d7b58"),
        ],
        [
            hex_const("1e0365a9b92d37b502579f6a3c3236df558f8417be56e58908897fa5cfbf15bb"),
            hex_const("2060426d53c6386a3f2f4e29d886bfc8e1be0ddafbdb50a9fd0be33143d1004a"),
            hex_const("1b917ac39485d49545e20d21e06735af839b1360e077daa4dfc2938ff91ce4d0"),
        ],
        [
            hex_const("2065aa0d75c8773cd397593ca429c21ad2d10c066a09dea04378fed619021786"),
            hex_const("04767c771c63b9efcaee16d3463c0457ba7f029dd533e5c7f4b3ccef3677db6b"),
            hex_const("2b632ce28c5d4908c11b68f4ed9e3da0dd104c018d2376eaa0abd28f9cf8bd76"),
        ],
    ]
}

/// Partial round keys: 56 constants
fn partial_round_keys() -> [Fr; 56] {
    [
        hex_const("122bd8150e3bf5129ed1f41b201d3881fe41c68ed194ffe6b414de857f03765d"),
        hex_const("23d4440906f4412f8994c3fa4cc08e849c0fbd10dc12518a07c0e8d77562c13f"),
        hex_const("2c5e99b87c743de13935855afed6cf836d6dd62ce31dfdca21efcfe197c9e321"),
        hex_const("06fba87a3924cbbb4117b782aa697bbc23900de6bf31a28ecc2f6a9225aebfe4"),
        hex_const("0c954d8f108f43ece97439775cfa22e1343a6cacae91604c76601eb6c7e90e1b"),
        hex_const("20980b82aa1ac356a0a48bc8101468c74f1efd47cd29ea01a852d6af93836a44"),
        hex_const("07e9df3ac21d190f9281b2ac56bf9dcce410bf95bd7fc196f4cfbb86acb60ec6"),
        hex_const("01e7459f591496f37d759e6eb427fa073eb923d9a67b066271dabe8e793ad796"),
        hex_const("0c1b5194e4c1af42dc01dadde54c73624ce1b8a0302d25ad499b2036f768e6e8"),
        hex_const("0cfd0f94030d285ffb85c8aa9f0675ac7077133b5a329c78b74656932fac8a27"),
        hex_const("0212ea73cc21625d7f1e361ad3df28c9f9cfd57fec66fb1bf69f1ab7cd11c55c"),
        hex_const("25fbc0b1fa13ea08b022f853e9b07a5c0fe9d5fb23c26eec54599100e60d57f6"),
        hex_const("074521adcc4a9387f4d6feeac681b1115b92f5e98e35d6d591d79b75d61d204c"),
        hex_const("267f9f5e6eea2a9d8816d7b683ab95d8121adeeaae66990bd24be95b6f0a0cd9"),
        hex_const("2fdf445c73cde6a7f4f23bef9bf520ceb72f08dabd391b118a253630f2878ade"),
        hex_const("02645e68b2890d258fa7eaffbc587c5ca8f7099cc4ddf923e23672c6153a8ae7"),
        hex_const("0c9e3d4841852fcf02818cdd86c3d86dcae4c1f7c140c3b17edc1f17b2652079"),
        hex_const("0a42e90f71ff44221ec000e0ff81b6f229292b0cb4470ff7c66c1fe06d9e69aa"),
        hex_const("1fb9a7d91fcf3173a1d80d3749192ed7d8a5b50cfd631571dc15154d0e71d7a2"),
        hex_const("10bff373cf04aca27c90792eaa545000503d6f118f4d9c5a906203aefe316d42"),
        hex_const("0956799581ce2c42ed5b55a130fb853683014e7cb9c3f32b9dfa4cf5c53127a"),
        hex_const("2b0bd2da61cae5f4f442b449cb1e9cc6af7a6d126b02ffd65aa887278741ab07"),
        hex_const("01c76af7e47ec30b4139081219fd7d173d498ba2e2ca928fb2b26019b16e5c64"),
        hex_const("2d9e586bd3c8cde82932cd1397db8564cbdebfc4f5c970e28a2d9f559db9d696"),
        hex_const("2c4b2a625ac29f468cc94f6a3ebdb7bb962f245568676073b829b95ace6d1ccc"),
        hex_const("027299c22883e4d52b8251a0724083c063e7be0a7f0070fba1c8d4d206841e6a"),
        hex_const("2af17121feea81979d98fa13cfdb5cf7f1f1717168ee7bf2da3709e589c381e7"),
        hex_const("09ad5501e4c9db7fee67f2fda8ce71162e6b2e0fc252f03c3d40470168ed4ea7"),
        hex_const("276bf230a40c51dac71697a84d603ac0423e3d8f23cc9330a23306976f7f902d"),
        hex_const("0b40af0d626b972c04b83a3897031c9bd0b4acc3b138fc505e15fdb6b60ba5f8"),
        hex_const("15c6033f97a1337ce18e37d0d22cf07f6c80f96af620c4d67c351e7210d688cf"),
        hex_const("27a5134eeea854449d10ae3dd3e17cbfc0f24c21a4265bb1e99982af48eb3966"),
        hex_const("0a3f27bafac251bbc63797868e84434a412400913e2e11616cb18f3bd01eb0d7"),
        hex_const("09409ff82de14430d5f1f16dd157c8175372a4f922b3563550230390c4476c59"),
        hex_const("1b6b39381a0b663344ee9a8cff259b84c593b709cf543014996ec33c7a00008b"),
        hex_const("16ac5b58d45468a298e60cbb92055daa665f29dd7194c77cac679c35f6f64552"),
        hex_const("121fb0f41bab603e46a4f4cb110d0a56bceff1f3af5577e7715e3777a5cfe7d8"),
        hex_const("056f262099a9d3e1d0060799732486358ad8b7bd2f515dd8767c2d19917d282d"),
        hex_const("0626740e4ff0fe7b8df127d56310c0c1fc47a07f630983bd55800ee8e24911d8"),
        hex_const("0b2b0b1213bed0c4b40fe2c938d076c65f22fe21eef4767b507561a63eea2874"),
        hex_const("1674784dcc6d6b3ef6467ee673c85311d1375aa39122ecf4b942caba565a6982"),
        hex_const("0690678b4bc42090fdbed7a334b323db5441a24c92b5b234f54ec16cff367db3"),
        hex_const("186719b1d7d0fb0087396c72ba57f53a5b67dc1077b82caadc62d5cdf7cd8db4"),
        hex_const("0178ed1e5ce3430020a30f0684fb01c60136e731a9a8c6afcbad139af2e8fcf7"),
        hex_const("1f31dc123a2384c71b57678dcf5a2fa6294f88a21a333cbec5facbc69424306c"),
        hex_const("017d928d2e3dbbe3a273f0bec79f881f8b75f4d333002b528fb1ae737cbf13eb"),
        hex_const("2f4fb0605668c045469510611c0137828be267709c0fa9392c28c2d95f9504bb"),
        hex_const("2ee2627a181d62b24501da3efccba9b4a9b61e6d9a7cdaa152c39347bdebe481"),
        hex_const("254cd2d79997885ca82e0ec5998aab8de0b09a02d04f54dcbd1a6f8776fd537b"),
        hex_const("2aa675a61643b83ad60d88b16c574a4695fc1b463dd44f8bbd674d1a1294dbfe"),
        hex_const("2dbc70b7e86794439ebd7d10cee37147e51769ed7a441187f6e22e644a003a51"),
        hex_const("19fc425ab24feca173ddab7070ebb4a2eeb9b82bee3a399ebedef2affe3ecd96"),
        hex_const("1b7a37f7ef7ce586df66295e955aba1b9b15052673534d4c13e02c19f02959e2"),
        hex_const("0772f989bc7bc4361340c9887a0225b92a192c14a85dc3ade21f6135b9239341"),
        hex_const("13f24e0e97fad4c45866626b9a1b9f3cc46f4ab2a018f0bda5bdade2087a07cf"),
        hex_const("1976c62d2c2c4ba095ff81bef054fe0757d7301950ede83426a34dd6cc12a4a5"),
    ]
}

/// Full round keys (end): 4 tuples of [c0, c1, c2]
fn full_round_keys_end() -> [[Fr; 3]; 4] {
    [
        [
            hex_const("1ea7aeca90530805e5fa1b676a6f12ace24c1c0f5b6cd68bf01558be11bb864a"),
            hex_const("070249ba94928b35fe02f56b12590e86f21a8a19e949ec10b62a5fcefea5c2b3"),
            hex_const("02cd4b5f5d87caaac64f78c44a62c408211c2e1d70a69549f9f1d36bd8a46073"),
        ],
        [
            hex_const("07f4c9774540f9f81fa29a73910899ad91d950e8f83a4f52d37ccc35a982f152"),
            hex_const("02d8b931d897f634fd9cdae140a7b3f4d4bab1814e009fe84e754c4a23ae23cc"),
            hex_const("2b9e86726e0cfec43981d9898da6ddb631ae469a473aa73e570274ecd2376899"),
        ],
        [
            hex_const("0c96c00773943b1de5a3dfb5959f30975f85adc57cc641bc2cea037837447191"),
            hex_const("258a43226d21462808593a8701f2dce2aaa28668f8fe35647a706fa4a81d5d47"),
            hex_const("26688ac841f42286102d1494db773e91760d8cad9cfb1a654284ed630a9bee42"),
        ],
        [
            hex_const("0b39f30858ad21e1805c8ced014837777cfdd776fc2d4c07a97b2351f21764b1"),
            hex_const("0b114bc66867e038d6648a6ab3556243a5f78ea3db7aa997ba13961735792377"),
            hex_const("0c08b1719426f8ff2dee487f9f41ac785ffdb8a7be5fc869754689cb02999e51"),
        ],
    ]
}

/// S-box: x^5 mod p
#[inline]
fn sbox(x: Fr) -> Fr {
    let x2 = x * x;
    let x4 = x2 * x2;
    x4 * x
}

/// External matrix multiplication (used in full rounds).
#[inline]
fn external_matrix(s0: Fr, s1: Fr, s2: Fr) -> (Fr, Fr, Fr) {
    let sum = s0 + s1 + s2;
    (s0 + sum, s1 + sum, s2 + sum)
}

/// Partial matrix multiplication (used in partial rounds).
#[inline]
fn partial_matrix(s0: Fr, s1: Fr, s2: Fr) -> (Fr, Fr, Fr) {
    let sum = s0 + s1 + s2;
    (s0 + sum, s1 + sum, s2 + s2 + sum)
}

/// Apply one full Poseidon2 permutation to a 3-element state.
fn permutation(mut s0: Fr, mut s1: Fr, mut s2: Fr) -> (Fr, Fr, Fr) {
    let fk_start = full_round_keys_start();
    let pk = partial_round_keys();
    let fk_end = full_round_keys_end();

    // Initial external matrix
    (s0, s1, s2) = external_matrix(s0, s1, s2);

    // Full rounds (start)
    for [c0, c1, c2] in &fk_start {
        s0 = sbox(s0 + c0);
        s1 = sbox(s1 + c1);
        s2 = sbox(s2 + c2);
        (s0, s1, s2) = external_matrix(s0, s1, s2);
    }

    // Partial rounds
    for c in &pk {
        s0 = sbox(s0 + c);
        (s0, s1, s2) = partial_matrix(s0, s1, s2);
    }

    // Full rounds (end)
    for [c0, c1, c2] in &fk_end {
        s0 = sbox(s0 + c0);
        s1 = sbox(s1 + c1);
        s2 = sbox(s2 + c2);
        (s0, s1, s2) = external_matrix(s0, s1, s2);
    }

    (s0, s1, s2)
}

/// Hash two field elements with an explicit domain.
pub fn hash_domain(a: Fr, b: Fr, domain: Fr) -> Fr {
    let (s0, _, _) = permutation(a, b, domain);
    s0
}

/// Hash two field elements with the default (zero) domain.
pub fn hash(a: Fr, b: Fr) -> Fr {
    hash_domain(a, b, Fr::from(0u64))
}

/// Hash two field elements with a named domain.
pub fn hash_with_domain(a: Fr, b: Fr, domain: Poseidon2Domain) -> Fr {
    hash_domain(a, b, domain.value())
}

/// Hash a sequence of inputs with domain separation and optional seed.
///
/// Mirrors the TypeScript `hashSequenceWithDomain` folding pattern:
/// - If seed is provided: `h = hash(seed, inputs[0]); h = hash(h, inputs[1]); ...`
/// - If no seed: `h = hash(inputs[0], inputs[1]); h = hash(h, inputs[2]); ...`
/// - Single input without seed: `hash(0, inputs[0])`
pub fn hash_sequence_with_domain(inputs: &[Fr], domain: Fr, seed: Option<Fr>) -> Fr {
    if inputs.is_empty() {
        return seed.expect("hashSequenceWithDomain requires at least one input or a seed");
    }

    if inputs.len() == 1 && seed.is_none() {
        return hash_domain(Fr::from(0u64), inputs[0], domain);
    }

    let (mut acc, start_index) = if let Some(s) = seed {
        (hash_domain(s, inputs[0], domain), 1)
    } else {
        (hash_domain(inputs[0], inputs[1], domain), 2)
    };

    for input in &inputs[start_index..] {
        acc = hash_domain(acc, *input, domain);
    }

    acc
}

#[cfg(test)]
mod tests {
    use super::*;
    use ocash_types::{field_to_hex, hex_to_field};

    #[test]
    fn test_hex_const_roundtrip() {
        // Verify that hex_const correctly parses constants
        let c0 = hex_const("2ba117aea05b03e08d3e8cdc3441e489710b7eae2127240261f1161a4c375ec3");
        let hex = field_to_hex(&c0);
        assert_eq!(hex, "0x2ba117aea05b03e08d3e8cdc3441e489710b7eae2127240261f1161a4c375ec3",
            "hex_const roundtrip failed: {}", hex);

        // Verify sbox(c0) matches TS
        let x5 = sbox(c0);
        let x5_hex = field_to_hex(&x5);
        assert_eq!(x5_hex, "0x293f64520c1155417b864c644cdac3d2735b9120564ef863cebcbe322e8f951b",
            "sbox(c0) mismatch: {}", x5_hex);
    }

    #[test]
    fn test_hash_zero_zero() {
        let result = hash(Fr::from(0u64), Fr::from(0u64));
        let hex = field_to_hex(&result);
        assert_eq!(
            hex,
            "0x1fecb4beb3e5523b63e61f3f89216a71f3d686bcba6f3e35ce240b2404ae300a"
        );
    }

    #[test]
    fn test_hash_one_two() {
        let result = hash(Fr::from(1u64), Fr::from(2u64));
        let hex = field_to_hex(&result);
        assert_eq!(
            hex,
            "0x1bb27765b122dcd5e531fc44bd05257b6c167523f492f8afe8c3a68683097af3"
        );
    }

    #[test]
    fn test_hash_domain_record() {
        let result = hash_with_domain(Fr::from(1u64), Fr::from(2u64), Poseidon2Domain::Record);
        let hex = field_to_hex(&result);
        assert_eq!(
            hex,
            "0x3048d4e7ac8b75e96fa5e9f1d683d0e87ccfbeb2a99edc32e30ceee98c769278"
        );
    }

    #[test]
    fn test_poseidon2_vectors_from_json() {
        let data = include_str!("../../../tests/vectors/poseidon2.json");
        let vectors: Vec<serde_json::Value> = serde_json::from_str(data).unwrap();

        for v in &vectors {
            let a = hex_to_field(v["a"].as_str().unwrap()).unwrap();
            let b = hex_to_field(v["b"].as_str().unwrap()).unwrap();
            let domain = hex_to_field(v["domain_value"].as_str().unwrap()).unwrap();
            let expected = v["expected"].as_str().unwrap();

            let result = hash_domain(a, b, domain);
            let result_hex = field_to_hex(&result);

            assert_eq!(
                result_hex, expected,
                "Poseidon2 mismatch for test '{}': got {} expected {}",
                v["name"].as_str().unwrap(),
                result_hex,
                expected
            );
        }
    }

    #[test]
    fn test_poseidon2_sequence_vectors_from_json() {
        let data = include_str!("../../../tests/vectors/poseidon2_sequence.json");
        let vectors: Vec<serde_json::Value> = serde_json::from_str(data).unwrap();

        for v in &vectors {
            let inputs: Vec<Fr> = v["inputs"]
                .as_array()
                .unwrap()
                .iter()
                .map(|x| hex_to_field(x.as_str().unwrap()).unwrap())
                .collect();
            let domain_name = v["domain"].as_str().unwrap();
            let domain = Poseidon2Domain::from_name(domain_name).unwrap().value();
            let seed = v.get("seed").and_then(|s| s.as_str()).map(|s| hex_to_field(s).unwrap());
            let expected = v["expected"].as_str().unwrap();

            let result = hash_sequence_with_domain(&inputs, domain, seed);
            let result_hex = field_to_hex(&result);

            assert_eq!(
                result_hex, expected,
                "Poseidon2 sequence mismatch for test '{}': got {} expected {}",
                v["name"].as_str().unwrap(),
                result_hex,
                expected
            );
        }
    }
}
