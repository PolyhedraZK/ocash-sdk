export interface AppRecordOpening<T = bigint> {
  asset_id: T;
  asset_amount: T;
  user_pk: { user_address: [T, T] };
  blinding_factor: T;
  is_frozen: boolean;
}

import type { CommitmentData } from '../types';

export interface CommitmentDataJSON extends AppRecordOpening<string> {}

/**
 * Normalize a generic record opening into CommitmentData (bigint fields).
 */
export const toCommitmentData = (ro: AppRecordOpening<number | bigint | string>): CommitmentData => ({
  asset_id: BigInt(ro.asset_id),
  asset_amount: BigInt(ro.asset_amount),
  user_pk: {
    user_address: [BigInt(ro.user_pk.user_address[0]), BigInt(ro.user_pk.user_address[1])],
  },
  blinding_factor: BigInt(ro.blinding_factor),
  is_frozen: Boolean(ro.is_frozen),
});

/**
 * Convert CommitmentData back into a JSON-friendly record opening.
 */
export const toRecordOpeningJson = (ro: CommitmentData): AppRecordOpening<string> => ({
  asset_id: ro.asset_id.toString(),
  asset_amount: ro.asset_amount.toString(),
  user_pk: {
    user_address: [ro.user_pk.user_address[0].toString(), ro.user_pk.user_address[1].toString()],
  },
  blinding_factor: ro.blinding_factor.toString(),
  is_frozen: ro.is_frozen,
});
