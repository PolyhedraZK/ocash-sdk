//! Sync engine for incremental memo/nullifier synchronization with the Entry service.
//!
//! Resources synced:
//! - `memo`: Encrypted UTXO commitments (cid-indexed, contiguous)
//! - `nullifier`: Spent UTXO markers (nid-indexed by block order)
//! - `merkle`: Derived from memo sync (merkle root index cursor)

pub mod entry_client;

use std::sync::Arc;
use serde::{Deserialize, Serialize};
use ocash_store::{StorageAdapter, SyncCursor};
use ocash_types::{Hex, OcashError, Result};
use entry_client::EntryClient;

/// Sync engine configuration.
#[derive(Debug, Clone)]
pub struct SyncConfig {
    pub page_size: u64,
    pub poll_ms: u64,
    pub request_timeout_ms: u64,
}

impl Default for SyncConfig {
    fn default() -> Self {
        Self {
            page_size: 512,
            poll_ms: 15_000,
            request_timeout_ms: 20_000,
        }
    }
}

/// Sync status for a single chain.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncChainStatus {
    pub chain_id: u64,
    pub memo_cursor: u64,
    pub nullifier_cursor: u64,
    pub merkle_cursor: u64,
    pub is_syncing: bool,
}

/// Chain configuration for syncing.
#[derive(Debug, Clone)]
pub struct ChainConfig {
    pub chain_id: u64,
    pub entry_url: String,
    pub contract_address: String,
}

/// Sync event for progress reporting.
#[derive(Debug, Clone)]
pub enum SyncEvent {
    Start { chain_id: u64 },
    Progress { chain_id: u64, resource: String, downloaded: u64 },
    Done { chain_id: u64, cursor: SyncCursor },
    Error { chain_id: u64, message: String },
}

/// Callback type for sync events.
pub type SyncEventHandler = Box<dyn Fn(SyncEvent) + Send + Sync>;

/// The sync engine orchestrates incremental syncing across chains.
pub struct SyncEngine {
    config: SyncConfig,
    chains: Vec<ChainConfig>,
    store: Arc<dyn StorageAdapter>,
    on_event: Option<SyncEventHandler>,
}

impl SyncEngine {
    pub fn new(
        config: SyncConfig,
        chains: Vec<ChainConfig>,
        store: Arc<dyn StorageAdapter>,
        on_event: Option<SyncEventHandler>,
    ) -> Self {
        Self { config, chains, store, on_event }
    }

    fn emit(&self, event: SyncEvent) {
        if let Some(ref handler) = self.on_event {
            handler(event);
        }
    }

    /// Run a single sync pass for all configured chains.
    pub async fn sync_once(&self) -> Result<()> {
        for chain in &self.chains {
            self.sync_chain(chain).await?;
        }
        Ok(())
    }

    /// Sync a single chain: memos first, then nullifiers.
    async fn sync_chain(&self, chain: &ChainConfig) -> Result<()> {
        self.emit(SyncEvent::Start { chain_id: chain.chain_id });

        let mut cursor = self.store
            .get_sync_cursor(chain.chain_id)
            .await?
            .unwrap_or_default();

        let client = EntryClient::new(&chain.entry_url, Some(self.config.request_timeout_ms));

        // Sync memos
        self.sync_memos(&client, chain, &mut cursor).await?;

        // Sync nullifiers
        self.sync_nullifiers(&client, chain, &mut cursor).await?;

        // Persist cursor
        self.store.set_sync_cursor(chain.chain_id, &cursor).await?;

        self.emit(SyncEvent::Done {
            chain_id: chain.chain_id,
            cursor: cursor.clone(),
        });

        Ok(())
    }

    /// Sync memos incrementally, page by page.
    async fn sync_memos(
        &self,
        client: &EntryClient,
        chain: &ChainConfig,
        cursor: &mut SyncCursor,
    ) -> Result<u64> {
        let mut total_downloaded = 0u64;

        loop {
            let result = client
                .list_memos(
                    chain.chain_id,
                    &chain.contract_address,
                    cursor.memo,
                    self.config.page_size,
                )
                .await?;

            if result.items.is_empty() {
                break;
            }

            // Validate contiguous cids
            for (i, memo) in result.items.iter().enumerate() {
                let expected_cid = cursor.memo + i as u64;
                if memo.cid != expected_cid {
                    return Err(OcashError::Other(format!(
                        "non-contiguous memo cids: expected {}, got {}",
                        expected_cid, memo.cid
                    )));
                }
            }

            let count = result.items.len() as u64;
            total_downloaded += count;
            cursor.memo += count;

            self.emit(SyncEvent::Progress {
                chain_id: chain.chain_id,
                resource: "memo".into(),
                downloaded: total_downloaded,
            });

            // If we got fewer than page_size, we're caught up
            if count < self.config.page_size {
                break;
            }
        }

        Ok(total_downloaded)
    }

    /// Sync nullifiers incrementally, page by page.
    async fn sync_nullifiers(
        &self,
        client: &EntryClient,
        chain: &ChainConfig,
        cursor: &mut SyncCursor,
    ) -> Result<u64> {
        let mut total_downloaded = 0u64;

        loop {
            let result = client
                .list_nullifiers_by_block(
                    chain.chain_id,
                    &chain.contract_address,
                    cursor.nullifier,
                    self.config.page_size,
                )
                .await?;

            if result.items.is_empty() {
                break;
            }

            // Mark UTXOs as spent
            let nullifier_hexes: Vec<Hex> = result
                .items
                .iter()
                .map(|n| n.nullifier.clone())
                .collect();

            self.store
                .mark_spent(chain.chain_id, &nullifier_hexes)
                .await?;

            let count = result.items.len() as u64;
            total_downloaded += count;
            cursor.nullifier += count;

            self.emit(SyncEvent::Progress {
                chain_id: chain.chain_id,
                resource: "nullifier".into(),
                downloaded: total_downloaded,
            });

            if count < self.config.page_size {
                break;
            }
        }

        Ok(total_downloaded)
    }

    /// Get the current sync status for all chains.
    pub async fn get_status(&self) -> Result<Vec<SyncChainStatus>> {
        let mut statuses = Vec::new();
        for chain in &self.chains {
            let cursor = self.store
                .get_sync_cursor(chain.chain_id)
                .await?
                .unwrap_or_default();
            statuses.push(SyncChainStatus {
                chain_id: chain.chain_id,
                memo_cursor: cursor.memo,
                nullifier_cursor: cursor.nullifier,
                merkle_cursor: cursor.merkle,
                is_syncing: false,
            });
        }
        Ok(statuses)
    }
}
