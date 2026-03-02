//! Relayer request builder and client.
//!
//! - Build transfer/withdraw calldata
//! - Submit to relayer service
//! - Poll for transaction hash

use serde::{Deserialize, Serialize};
use ocash_types::Hex;

pub mod relayer_client;

/// Relayer request for transfer or withdraw.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RelayerRequest {
    pub chain_id: u64,
    pub action: String, // "transfer" or "withdraw"
    pub calldata: Hex,
    pub extra_data: Vec<Hex>,
}

/// Relayer response after submission.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RelayerSubmitResponse {
    pub relayer_tx_hash: Hex,
}
