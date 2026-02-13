"""Test crypto primitives against shared JSON test vectors."""
import json
import os

import ocash

VECTORS_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "core", "tests", "vectors")

# Domain name → hex field value (matches Poseidon2Domain.value() in Rust)
DOMAIN_HEX = {
    "None": "0x0000000000000000000000000000000000000000000000000000000000000000",
    "Record": "0x0000000000000000000000000000000000000000000000005245434f52440000",
    "Nullifier": "0x0000000000000000000000000000000000000000000000004e554c4c49464945",
    "Merkle": "0x0000000000000000000000000000000000000000000000004d45524b4c450000",
    "Policy": "0x000000000000000000000000000000000000000000000000504f4c4943590000",
    "Array": "0x0000000000000000000000000000000000000000000000004152524159000000",
    "Memo": "0x0000000000000000000000000000000000000000000000004d454d4f00000000",
    "Asset": "0x0000000000000000000000000000000000000000000000004153534554000000",
    "KeyDerivation": "0x0000000000000000000000000000000000000000000000004b45594445520000",
}


def load_vectors(name: str):
    with open(os.path.join(VECTORS_DIR, f"{name}.json")) as f:
        return json.load(f)


class TestPoseidon2:
    def test_hash_vectors(self):
        for v in load_vectors("poseidon2"):
            result = ocash.poseidon2_hash(v["a"], v["b"], v["domain"])
            assert result == v["expected"], f"{v['name']}: {result} != {v['expected']}"

    def test_sequence_vectors(self):
        for v in load_vectors("poseidon2_sequence"):
            domain_hex = DOMAIN_HEX[v["domain"]]
            seed = v.get("seed")
            result = ocash.poseidon2_hash_sequence(v["inputs"], domain_hex, seed)
            assert result == v["expected"], f"{v['name']}: {result} != {v['expected']}"


class TestBabyJubjub:
    def test_scalar_mult(self):
        vectors = load_vectors("babyjubjub")
        gx = vectors["constants"]["base_point_x"]
        gy = vectors["constants"]["base_point_y"]
        for v in vectors["scalar_mult"]:
            result = ocash.babyjubjub_mul_point(gx, gy, v["scalar"])
            assert result["x"] == v["expected_x"], f"{v['name']} x: {result['x']} != {v['expected_x']}"
            assert result["y"] == v["expected_y"], f"{v['name']} y: {result['y']} != {v['expected_y']}"

    def test_compress_decompress(self):
        vectors = load_vectors("babyjubjub")
        for v in vectors["compress_decompress"]:
            compressed = ocash.babyjubjub_compress(v["x"], v["y"])
            assert compressed == v["compressed"], f"{v['name']} compress: {compressed} != {v['compressed']}"

            decompressed = ocash.babyjubjub_decompress(v["compressed"])
            assert decompressed["x"] == v["x"], f"{v['name']} decompress x"
            assert decompressed["y"] == v["y"], f"{v['name']} decompress y"


class TestKeyDerivation:
    def test_vectors(self):
        for v in load_vectors("key_derivation"):
            nonce = v.get("nonce")
            result = ocash.derive_key_pair(v["seed"], nonce)
            assert result["secret_key"] == v["expected_sk"], f"{v['name']} sk"
            assert result["public_key_x"] == v["expected_pk_x"], f"{v['name']} pk_x"
            assert result["public_key_y"] == v["expected_pk_y"], f"{v['name']} pk_y"


class TestCommitment:
    def test_vectors(self):
        for v in load_vectors("commitment"):
            r = v["record"]
            result = ocash.commitment(
                r["user_pk_x"], r["user_pk_y"],
                r["blinding_factor"], r["asset_id"],
                r["asset_amount"], r["is_frozen"],
            )
            assert result == v["expected_hex"], f"{v['name']}: {result} != {v['expected_hex']}"


class TestNullifier:
    def test_vectors(self):
        for v in load_vectors("nullifier"):
            freezer = v.get("freezer_pk")
            fx = freezer["x"] if freezer else None
            fy = freezer["y"] if freezer else None
            result = ocash.nullifier(
                v["secret_key"], v["commitment"],
                freezer_pk_x=fx, freezer_pk_y=fy,
            )
            assert result == v["expected"], f"{v['name']}: {result} != {v['expected']}"


class TestRecordCodec:
    def test_vectors(self):
        for v in load_vectors("record_codec"):
            r = v["record"]
            record_dict = {
                "asset_id": r["asset_id"],
                "asset_amount": r["asset_amount"],
                "user_pk_x": r["user_pk_x"],
                "user_pk_y": r["user_pk_y"],
                "blinding_factor": r["blinding_factor"],
                "is_frozen": r["is_frozen"],
            }
            encoded = ocash.record_encode(record_dict)
            assert encoded == v["encoded"], f"{v['name']} encode: {encoded} != {v['encoded']}"

            decoded = ocash.record_decode(encoded)
            assert decoded["asset_id"] == r["asset_id"], f"{v['name']} decode asset_id"
            assert decoded["asset_amount"] == r["asset_amount"], f"{v['name']} decode asset_amount"
            assert decoded["user_pk_x"] == r["user_pk_x"], f"{v['name']} decode user_pk_x"
            assert decoded["user_pk_y"] == r["user_pk_y"], f"{v['name']} decode user_pk_y"
            assert decoded["blinding_factor"] == r["blinding_factor"], f"{v['name']} decode blinding_factor"
            assert decoded["is_frozen"] == r["is_frozen"], f"{v['name']} decode is_frozen"


class TestMemoNonce:
    def test_vectors(self):
        for v in load_vectors("memo_nonce"):
            result = ocash.memo_nonce(
                v["ephemeral_pk_x"], v["ephemeral_pk_y"],
                v["user_pk_x"], v["user_pk_y"],
            )
            assert result == v["expected_nonce"], f"{v['name']}: {result} != {v['expected_nonce']}"


class TestMemoRoundtrip:
    def test_encrypt_decrypt(self):
        kp = ocash.derive_key_pair("test-seed-python-memo-roundtrip")
        record_dict = {
            "asset_id": "0x0000000000000000000000000000000000000000000000000000000000000001",
            "asset_amount": "0x00000000000000000000000000000000000000000000000000000000000003e8",
            "user_pk_x": kp["public_key_x"],
            "user_pk_y": kp["public_key_y"],
            "blinding_factor": "0x000000000000000000000000000000000000000000000000000000000000002a",
            "is_frozen": False,
        }

        memo_hex = ocash.memo_create(record_dict)
        assert memo_hex.startswith("0x")

        decoded = ocash.memo_decrypt(kp["secret_key"], memo_hex)
        assert decoded is not None
        assert decoded["asset_id"] == record_dict["asset_id"]
        assert decoded["asset_amount"] == record_dict["asset_amount"]
        assert decoded["user_pk_x"] == record_dict["user_pk_x"]
        assert decoded["user_pk_y"] == record_dict["user_pk_y"]
        assert decoded["blinding_factor"] == record_dict["blinding_factor"]
        assert decoded["is_frozen"] == record_dict["is_frozen"]
