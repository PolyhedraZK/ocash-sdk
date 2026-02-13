//! Storage adapter trait and implementations for the OCash SDK.
//!
//! Defines the `StorageAdapter` trait that all storage backends must implement.
//! Provides a `MemoryStore` for testing.

use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use ocash_types::{Hex, Result};

pub mod memory;

/// Sync cursor tracking progress per chain.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct SyncCursor {
    pub memo: u64,
    pub nullifier: u64,
    pub merkle: u64,
}

/// A UTXO record stored in the wallet.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UtxoRecord {
    pub chain_id: u64,
    pub asset_id: String,
    pub amount: String, // hex-encoded bigint
    pub commitment: Hex,
    pub nullifier: Hex,
    pub mk_index: u64,
    pub is_frozen: bool,
    pub is_spent: bool,
    pub memo: Option<Hex>,
    pub created_at: Option<u64>,
}

/// Query for listing UTXOs.
#[derive(Debug, Clone, Default)]
pub struct ListUtxosQuery {
    pub chain_id: Option<u64>,
    pub asset_id: Option<String>,
    pub unspent_only: bool,
}

/// Merkle node record for local proof generation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MerkleNodeRecord {
    pub chain_id: u64,
    pub id: String,
    pub level: u32,
    pub position: u64,
    pub hash: Hex,
}

/// Merkle tree state metadata.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MerkleTreeState {
    pub chain_id: u64,
    pub root: Hex,
    pub total_elements: u64,
    pub last_updated: u64,
}

/// Stored operation (transaction history).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoredOperation {
    pub id: String,
    pub chain_id: u64,
    pub op_type: String,
    pub status: String,
    pub tx_hash: Option<Hex>,
    pub created_at: u64,
    pub updated_at: u64,
    pub data: serde_json::Value,
}

/// The core storage adapter trait.
///
/// All methods are async to support both in-memory and persistent backends.
#[async_trait]
pub trait StorageAdapter: Send + Sync {
    // --- Lifecycle ---
    async fn init(&self) -> Result<()> { Ok(()) }
    async fn close(&self) -> Result<()> { Ok(()) }

    // --- Sync Cursors ---
    async fn get_sync_cursor(&self, chain_id: u64) -> Result<Option<SyncCursor>>;
    async fn set_sync_cursor(&self, chain_id: u64, cursor: &SyncCursor) -> Result<()>;

    // --- UTXO Management ---
    async fn upsert_utxos(&self, utxos: &[UtxoRecord]) -> Result<()>;
    async fn list_utxos(&self, query: &ListUtxosQuery) -> Result<Vec<UtxoRecord>>;
    async fn mark_spent(&self, chain_id: u64, nullifiers: &[Hex]) -> Result<u64>;

    // --- Merkle State (optional for local/hybrid mode) ---
    async fn get_merkle_tree(&self, _chain_id: u64) -> Result<Option<MerkleTreeState>> {
        Ok(None)
    }
    async fn set_merkle_tree(&self, _chain_id: u64, _tree: &MerkleTreeState) -> Result<()> {
        Ok(())
    }
    async fn upsert_merkle_nodes(&self, _chain_id: u64, _nodes: &[MerkleNodeRecord]) -> Result<()> {
        Ok(())
    }
    async fn get_merkle_node(&self, _chain_id: u64, _id: &str) -> Result<Option<MerkleNodeRecord>> {
        Ok(None)
    }

    // --- Operations ---
    async fn create_operation(&self, op: &StoredOperation) -> Result<()>;
    async fn list_operations(&self, chain_id: Option<u64>) -> Result<Vec<StoredOperation>>;
}
