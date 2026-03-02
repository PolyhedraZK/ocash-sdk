//! Coin selection and transaction planning for transfers and withdrawals.
//!
//! - Transfer: up to 3 inputs, 3 outputs (recipient, change, dummy)
//! - Withdraw: 1 input, 1 change output
//! - Fee calculation with relayer fees and protocol fees
//! - Auto-merge: consolidate small UTXOs when needed

use serde::{Deserialize, Serialize};
use ocash_store::UtxoRecord;
use ocash_types::Hex;

/// Planned transfer operation.
#[derive(Debug, Clone)]
pub struct TransferPlan {
    pub chain_id: u64,
    pub asset_id: String,
    pub requested_amount: String,
    pub send_amount: String,
    pub to: Hex,
    pub relayer_fee: String,
    pub selected_inputs: Vec<UtxoRecord>,
    pub fee_summary: FeeSummary,
}

/// Planned withdrawal operation.
#[derive(Debug, Clone)]
pub struct WithdrawPlan {
    pub chain_id: u64,
    pub asset_id: String,
    pub requested_amount: String,
    pub burn_amount: String,
    pub recipient: Hex,
    pub relayer_fee: String,
    pub protocol_fee: String,
    pub gas_drop_value: String,
    pub selected_input: UtxoRecord,
    pub fee_summary: FeeSummary,
}

/// Fee breakdown summary.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FeeSummary {
    pub relayer_fee: String,
    pub protocol_fee: String,
    pub total_fee: String,
}

/// Coin selection result.
#[derive(Debug, Clone)]
pub struct CoinSelection {
    pub selected: Vec<UtxoRecord>,
    pub sum: String, // hex-encoded total
}

/// Select UTXOs for a transfer (greedy, up to max_inputs).
pub fn select_transfer_inputs(
    utxos: &[UtxoRecord],
    required: &str,
    max_inputs: usize,
) -> CoinSelection {
    let required_val = u128::from_str_radix(
        required.strip_prefix("0x").unwrap_or(required),
        16,
    ).unwrap_or(0);

    // Sort descending by amount
    let mut sorted: Vec<_> = utxos.to_vec();
    sorted.sort_by(|a, b| {
        let a_val = u128::from_str_radix(a.amount.strip_prefix("0x").unwrap_or(&a.amount), 16).unwrap_or(0);
        let b_val = u128::from_str_radix(b.amount.strip_prefix("0x").unwrap_or(&b.amount), 16).unwrap_or(0);
        b_val.cmp(&a_val)
    });

    let mut selected = Vec::new();
    let mut sum = 0u128;

    for utxo in sorted.iter().take(max_inputs) {
        let val = u128::from_str_radix(
            utxo.amount.strip_prefix("0x").unwrap_or(&utxo.amount),
            16,
        ).unwrap_or(0);
        selected.push(utxo.clone());
        sum += val;
        if sum >= required_val {
            break;
        }
    }

    CoinSelection {
        selected,
        sum: format!("0x{:x}", sum),
    }
}

/// Select a single UTXO for a withdrawal.
pub fn select_withdraw_input(
    utxos: &[UtxoRecord],
    required: &str,
) -> Option<UtxoRecord> {
    let required_val = u128::from_str_radix(
        required.strip_prefix("0x").unwrap_or(required),
        16,
    ).unwrap_or(0);

    let mut sorted: Vec<_> = utxos.to_vec();
    sorted.sort_by(|a, b| {
        let a_val = u128::from_str_radix(a.amount.strip_prefix("0x").unwrap_or(&a.amount), 16).unwrap_or(0);
        let b_val = u128::from_str_radix(b.amount.strip_prefix("0x").unwrap_or(&b.amount), 16).unwrap_or(0);
        b_val.cmp(&a_val)
    });

    sorted.into_iter().find(|u| {
        let val = u128::from_str_radix(
            u.amount.strip_prefix("0x").unwrap_or(&u.amount),
            16,
        ).unwrap_or(0);
        val >= required_val
    })
}
