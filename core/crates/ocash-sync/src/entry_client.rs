//! HTTP client for the OCash Entry service.
//!
//! Endpoints:
//! - GET /api/v1/viewing/memos/list
//! - GET /api/v1/viewing/nullifier/list_by_block

use serde::{Deserialize, Serialize};
use ocash_types::{Hex, OcashError, Result};
use std::time::Duration;

/// An entry memo from the Entry service.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EntryMemo {
    pub cid: u64,
    pub commitment: Hex,
    pub memo: Hex,
}

/// An entry nullifier from the Entry service.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EntryNullifier {
    pub nid: u64,
    pub nullifier: Hex,
}

/// Entry service API response wrapper.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EntryResponse<T> {
    pub code: Option<i32>,
    pub message: Option<String>,
    pub data: EntryResponseData<T>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EntryResponseData<T> {
    pub data: Vec<T>,
    pub total: u64,
    pub ready: Option<bool>,
}

/// List memos query result.
pub struct ListMemosResult {
    pub items: Vec<EntryMemo>,
    pub total: u64,
}

/// List nullifiers query result.
pub struct ListNullifiersResult {
    pub items: Vec<EntryNullifier>,
    pub total: u64,
    pub ready: bool,
}

/// Entry service client.
pub struct EntryClient {
    base_url: String,
    client: reqwest::Client,
    timeout: Duration,
}

impl EntryClient {
    pub fn new(base_url: &str, timeout_ms: Option<u64>) -> Self {
        let timeout_ms = timeout_ms.unwrap_or(20_000);
        Self {
            base_url: base_url.trim_end_matches('/').to_string(),
            client: reqwest::Client::builder()
                .timeout(Duration::from_millis(timeout_ms))
                .build()
                .unwrap_or_default(),
            timeout: Duration::from_millis(timeout_ms),
        }
    }

    /// Fetch memos from the Entry service.
    ///
    /// GET /api/v1/viewing/memos/list?chain_id=X&address=ADDR&offset=N&limit=L&order=asc
    pub async fn list_memos(
        &self,
        chain_id: u64,
        contract_address: &str,
        offset: u64,
        limit: u64,
    ) -> Result<ListMemosResult> {
        let url = format!(
            "{}/api/v1/viewing/memos/list?chain_id={}&address={}&offset={}&limit={}&order=asc",
            self.base_url, chain_id, contract_address, offset, limit
        );

        let resp = self.client
            .get(&url)
            .timeout(self.timeout)
            .send()
            .await
            .map_err(|e| OcashError::Other(format!("entry request failed: {}", e)))?;

        if !resp.status().is_success() {
            return Err(OcashError::Other(format!(
                "entry service returned status {}",
                resp.status()
            )));
        }

        let body: EntryResponse<EntryMemo> = resp
            .json()
            .await
            .map_err(|e| OcashError::Other(format!("failed to parse entry response: {}", e)))?;

        Ok(ListMemosResult {
            items: body.data.data,
            total: body.data.total,
        })
    }

    /// Fetch nullifiers from the Entry service.
    ///
    /// GET /api/v1/viewing/nullifier/list_by_block?chain_id=X&address=ADDR&offset=N&limit=L&order=asc
    pub async fn list_nullifiers_by_block(
        &self,
        chain_id: u64,
        contract_address: &str,
        offset: u64,
        limit: u64,
    ) -> Result<ListNullifiersResult> {
        let url = format!(
            "{}/api/v1/viewing/nullifier/list_by_block?chain_id={}&address={}&offset={}&limit={}&order=asc",
            self.base_url, chain_id, contract_address, offset, limit
        );

        let resp = self.client
            .get(&url)
            .timeout(self.timeout)
            .send()
            .await
            .map_err(|e| OcashError::Other(format!("entry request failed: {}", e)))?;

        if !resp.status().is_success() {
            return Err(OcashError::Other(format!(
                "entry service returned status {}",
                resp.status()
            )));
        }

        let body: EntryResponse<EntryNullifier> = resp
            .json()
            .await
            .map_err(|e| OcashError::Other(format!("failed to parse entry response: {}", e)))?;

        Ok(ListNullifiersResult {
            items: body.data.data,
            total: body.data.total,
            ready: body.data.ready.unwrap_or(true),
        })
    }
}
