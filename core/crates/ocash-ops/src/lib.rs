//! End-to-end operation orchestration: deposit, transfer, withdraw.
//!
//! Coordinates between planner, merkle, crypto, and relayer modules
//! to execute privacy-preserving transactions.

use std::sync::Arc;
use ark_bn254::Fr;
use serde::{Deserialize, Serialize};
use ocash_types::{Hex, OcashError, Result};
use ocash_crypto::{
    commitment, keys, memo, nullifier,
    record::RecordOpening,
};
use ocash_store::{StorageAdapter, UtxoRecord};
use ocash_merkle::LocalMerkleTree;
use ocash_tx::RelayerRequest;

/// User key pair for operations.
#[derive(Debug, Clone)]
pub struct UserKeyPair {
    pub secret_key: Fr,
    pub public_key: (Fr, Fr),
}

impl UserKeyPair {
    /// Derive a key pair from a seed and optional nonce.
    pub fn from_seed(seed: &str, nonce: Option<&str>) -> Result<Self> {
        let (sk, pk) = keys::derive_key_pair(seed, nonce)?;
        Ok(Self { secret_key: sk, public_key: pk })
    }
}

/// Prepared deposit operation (ready for on-chain submission).
#[derive(Debug, Clone)]
pub struct PreparedDeposit {
    pub chain_id: u64,
    pub asset_id: Fr,
    pub amount: Fr,
    pub record_opening: RecordOpening,
    pub commitment: Fr,
    pub memo_hex: Hex,
    pub protocol_fee: u64,
}

/// Prepared transfer result.
#[derive(Debug, Clone)]
pub struct PreparedTransfer {
    pub chain_id: u64,
    pub asset_id: String,
    pub amount: String,
    pub to: Hex,
    pub selected_inputs: Vec<UtxoRecord>,
    pub output_records: Vec<RecordOpening>,
    pub output_memos: Vec<Hex>,
    pub relayer_request: RelayerRequest,
}

/// Prepared withdrawal result.
#[derive(Debug, Clone)]
pub struct PreparedWithdraw {
    pub chain_id: u64,
    pub asset_id: String,
    pub amount: String,
    pub recipient: Hex,
    pub selected_input: UtxoRecord,
    pub change_record: RecordOpening,
    pub change_memo: Hex,
    pub relayer_request: RelayerRequest,
}

/// Input secret for ZKP witness generation.
#[derive(Debug, Clone)]
pub struct InputSecret {
    pub owner_key_pair: UserKeyPair,
    pub record_opening: RecordOpening,
    pub merkle_root: Fr,
    pub merkle_path: Vec<Fr>,
    pub merkle_index: u64,
}

/// Operation type for tracking.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum OperationType {
    Deposit,
    Transfer,
    Withdraw,
}

/// The operations engine orchestrates deposit, transfer, and withdraw flows.
pub struct OpsEngine {
    store: Arc<dyn StorageAdapter>,
}

impl OpsEngine {
    pub fn new(store: Arc<dyn StorageAdapter>) -> Self {
        Self { store }
    }

    /// Prepare a deposit: create record opening, commitment, and memo.
    ///
    /// The caller is responsible for submitting the on-chain transaction.
    pub fn prepare_deposit(
        &self,
        chain_id: u64,
        asset_id: Fr,
        amount: Fr,
        owner: &UserKeyPair,
        blinding_factor: Fr,
    ) -> Result<PreparedDeposit> {
        let ro = RecordOpening {
            asset_id,
            asset_amount: amount,
            user_pk: owner.public_key,
            blinding_factor,
            is_frozen: false,
        };

        let commit = commitment::compute(&ro)?;
        let memo_hex = memo::create_memo(&ro)?;

        Ok(PreparedDeposit {
            chain_id,
            asset_id,
            amount,
            record_opening: ro,
            commitment: commit,
            memo_hex,
            protocol_fee: 0,
        })
    }

    /// Create a UTXO record from a decoded record opening (after memo decryption).
    pub fn create_utxo_from_record(
        &self,
        chain_id: u64,
        ro: &RecordOpening,
        owner_sk: &Fr,
        mk_index: u64,
        memo_hex: Option<&str>,
    ) -> Result<UtxoRecord> {
        let commit = commitment::compute(ro)?;
        let commit_hex = ocash_types::field_to_hex(&commit);
        let null_hex = nullifier::compute(owner_sk, &commit, None)?;

        Ok(UtxoRecord {
            chain_id,
            asset_id: ocash_types::field_to_hex(&ro.asset_id),
            amount: ocash_types::field_to_hex(&ro.asset_amount),
            commitment: commit_hex,
            nullifier: ocash_types::field_to_hex(&null_hex),
            mk_index,
            is_frozen: ro.is_frozen,
            is_spent: false,
            memo: memo_hex.map(|s| s.to_string()),
            created_at: None,
        })
    }

    /// Build input secrets for ZKP witness from UTXOs and Merkle proofs.
    pub fn build_input_secrets(
        &self,
        utxos: &[UtxoRecord],
        owner: &UserKeyPair,
        merkle_tree: &LocalMerkleTree,
    ) -> Result<Vec<InputSecret>> {
        let cids: Vec<usize> = utxos.iter().map(|u| u.mk_index as usize).collect();
        let proofs = merkle_tree.build_proof_by_cids(&cids);
        let root = merkle_tree.root();

        let mut secrets = Vec::new();
        for (utxo, proof) in utxos.iter().zip(proofs.iter()) {
            // Decrypt the memo to get the record opening
            let ro = if let Some(ref memo_hex) = utxo.memo {
                memo::decrypt_memo(&owner.secret_key, memo_hex)?
                    .ok_or_else(|| OcashError::Other("failed to decrypt memo".into()))?
            } else {
                return Err(OcashError::Other("utxo has no memo".into()));
            };

            secrets.push(InputSecret {
                owner_key_pair: owner.clone(),
                record_opening: ro,
                merkle_root: root,
                merkle_path: proof.path.clone(),
                merkle_index: utxo.mk_index,
            });
        }

        Ok(secrets)
    }
}
