//! In-memory storage adapter for testing.

use async_trait::async_trait;
use std::collections::HashMap;
use std::sync::Mutex;

use crate::*;
use ocash_types::Result;

/// In-memory storage adapter (for testing and ephemeral use).
pub struct MemoryStore {
    cursors: Mutex<HashMap<u64, SyncCursor>>,
    utxos: Mutex<Vec<UtxoRecord>>,
    operations: Mutex<Vec<StoredOperation>>,
}

impl MemoryStore {
    pub fn new() -> Self {
        Self {
            cursors: Mutex::new(HashMap::new()),
            utxos: Mutex::new(Vec::new()),
            operations: Mutex::new(Vec::new()),
        }
    }
}

impl Default for MemoryStore {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl StorageAdapter for MemoryStore {
    async fn get_sync_cursor(&self, chain_id: u64) -> Result<Option<SyncCursor>> {
        let cursors = self.cursors.lock().unwrap();
        Ok(cursors.get(&chain_id).cloned())
    }

    async fn set_sync_cursor(&self, chain_id: u64, cursor: &SyncCursor) -> Result<()> {
        let mut cursors = self.cursors.lock().unwrap();
        cursors.insert(chain_id, cursor.clone());
        Ok(())
    }

    async fn upsert_utxos(&self, utxos: &[UtxoRecord]) -> Result<()> {
        let mut store = self.utxos.lock().unwrap();
        for utxo in utxos {
            if let Some(existing) = store.iter_mut().find(|u| u.commitment == utxo.commitment) {
                *existing = utxo.clone();
            } else {
                store.push(utxo.clone());
            }
        }
        Ok(())
    }

    async fn list_utxos(&self, query: &ListUtxosQuery) -> Result<Vec<UtxoRecord>> {
        let store = self.utxos.lock().unwrap();
        let filtered = store
            .iter()
            .filter(|u| {
                if let Some(cid) = query.chain_id {
                    if u.chain_id != cid { return false; }
                }
                if let Some(ref aid) = query.asset_id {
                    if u.asset_id != *aid { return false; }
                }
                if query.unspent_only && u.is_spent {
                    return false;
                }
                true
            })
            .cloned()
            .collect();
        Ok(filtered)
    }

    async fn mark_spent(&self, chain_id: u64, nullifiers: &[Hex]) -> Result<u64> {
        let mut store = self.utxos.lock().unwrap();
        let mut count = 0u64;
        for utxo in store.iter_mut() {
            if utxo.chain_id == chain_id && nullifiers.contains(&utxo.nullifier) && !utxo.is_spent {
                utxo.is_spent = true;
                count += 1;
            }
        }
        Ok(count)
    }

    async fn create_operation(&self, op: &StoredOperation) -> Result<()> {
        let mut ops = self.operations.lock().unwrap();
        ops.push(op.clone());
        Ok(())
    }

    async fn list_operations(&self, chain_id: Option<u64>) -> Result<Vec<StoredOperation>> {
        let ops = self.operations.lock().unwrap();
        let filtered = ops
            .iter()
            .filter(|o| chain_id.map_or(true, |cid| o.chain_id == cid))
            .cloned()
            .collect();
        Ok(filtered)
    }
}
