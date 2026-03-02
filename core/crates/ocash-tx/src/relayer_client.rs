//! HTTP client for the OCash Relayer service.
//!
//! Endpoints:
//! - POST /api/v1/transfer
//! - POST /api/v1/withdraw
//! - GET /api/v1/txhash?txhash=<relayer_tx_hash>

use serde::{Deserialize, Serialize};
use ocash_types::{Hex, OcashError, Result};
use std::time::Duration;

use crate::RelayerRequest;

/// Relayer API response wrapper.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RelayerResponse<T> {
    pub code: Option<i32>,
    pub message: Option<String>,
    pub user_message: Option<String>,
    pub data: T,
}

/// Relayer client for submitting transactions.
pub struct RelayerClient {
    base_url: String,
    client: reqwest::Client,
    timeout: Duration,
}

impl RelayerClient {
    pub fn new(base_url: &str, timeout_ms: Option<u64>) -> Self {
        let timeout_ms = timeout_ms.unwrap_or(30_000);
        Self {
            base_url: base_url.trim_end_matches('/').to_string(),
            client: reqwest::Client::builder()
                .timeout(Duration::from_millis(timeout_ms))
                .build()
                .unwrap_or_default(),
            timeout: Duration::from_millis(timeout_ms),
        }
    }

    /// Submit a transfer or withdraw request to the relayer.
    ///
    /// POST /api/v1/transfer or /api/v1/withdraw
    pub async fn submit(&self, request: &RelayerRequest) -> Result<Hex> {
        let endpoint = match request.action.as_str() {
            "transfer" => "/api/v1/transfer",
            "withdraw" => "/api/v1/withdraw",
            other => return Err(OcashError::Other(format!("unknown action: {}", other))),
        };

        let url = format!("{}{}", self.base_url, endpoint);

        let resp = self.client
            .post(&url)
            .json(request)
            .timeout(self.timeout)
            .send()
            .await
            .map_err(|e| OcashError::Other(format!("relayer request failed: {}", e)))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            return Err(OcashError::Other(format!(
                "relayer returned status {}: {}",
                status, body
            )));
        }

        let body: RelayerResponse<Hex> = resp
            .json()
            .await
            .map_err(|e| OcashError::Other(format!("failed to parse relayer response: {}", e)))?;

        Ok(body.data)
    }

    /// Poll for the actual transaction hash from a relayer tx hash.
    ///
    /// GET /api/v1/txhash?txhash=<relayer_tx_hash>
    pub async fn get_tx_hash(&self, relayer_tx_hash: &str) -> Result<Option<Hex>> {
        let url = format!(
            "{}/api/v1/txhash?txhash={}",
            self.base_url, relayer_tx_hash
        );

        let resp = self.client
            .get(&url)
            .timeout(self.timeout)
            .send()
            .await
            .map_err(|e| OcashError::Other(format!("relayer request failed: {}", e)))?;

        if !resp.status().is_success() {
            return Ok(None);
        }

        let body: RelayerResponse<Option<Hex>> = resp
            .json()
            .await
            .map_err(|e| OcashError::Other(format!("failed to parse relayer response: {}", e)))?;

        Ok(body.data)
    }

    /// Poll for tx hash with retries, waiting between attempts.
    pub async fn wait_for_tx_hash(
        &self,
        relayer_tx_hash: &str,
        max_attempts: u32,
        poll_interval_ms: u64,
    ) -> Result<Hex> {
        for attempt in 0..max_attempts {
            if let Some(tx_hash) = self.get_tx_hash(relayer_tx_hash).await? {
                return Ok(tx_hash);
            }
            if attempt + 1 < max_attempts {
                tokio::time::sleep(Duration::from_millis(poll_interval_ms)).await;
            }
        }
        Err(OcashError::Other(format!(
            "tx hash not available after {} attempts for relayer tx {}",
            max_attempts, relayer_tx_hash
        )))
    }
}
