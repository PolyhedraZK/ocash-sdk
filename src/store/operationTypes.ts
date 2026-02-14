/**
 * Lifecycle states for local operation records.
 */
export type OperationStatus = 'created' | 'submitted' | 'confirmed' | 'failed';

/**
 * Built-in operation types with support for custom extensions.
 */
export type OperationType = 'deposit' | 'transfer' | 'withdraw' | (string & {});

type Hex = `0x${string}`;

/**
 * Query/filter options for listing operations.
 */
export type ListOperationsQuery = {
  limit?: number;
  offset?: number;
  chainId?: number;
  tokenId?: string;
  type?: OperationType | OperationType[];
  status?: OperationStatus | OperationStatus[];
  sort?: 'desc' | 'asc';
};

/**
 * Detail payload for deposit operations.
 */
export type DepositOperationDetail = {
  token: string;
  amount: string;
  protocolFee?: string;
  depositRelayerFee?: string;
  inputCommitments?: Hex[];
  outputCommitments?: Hex[];
};

/**
 * Detail payload for transfer operations.
 */
export type TransferOperationDetail = {
  token: string;
  amount: string;
  fee?: string;
  relayerFeeTotal?: string;
  protocolFeeTotal?: string;
  mergeCount?: number;
  feeCount?: number;
  to: Hex;
  inputCommitments?: Hex[];
  outputCommitments?: Hex[];
};

/**
 * Detail payload for withdraw operations.
 */
export type WithdrawOperationDetail = {
  token: string;
  amount: string;
  burnAmount?: string;
  protocolFee?: string;
  relayerFee?: string;
  relayerFeeTotal?: string;
  protocolFeeTotal?: string;
  mergeCount?: number;
  feeCount?: number;
  recipient: Hex;
  inputCommitments?: Hex[];
  outputCommitments?: Hex[];
};

/**
 * Mapping of builtin operation types to their detail payloads.
 */
export type BuiltinOperationDetailByType = {
  deposit: DepositOperationDetail;
  transfer: TransferOperationDetail;
  withdraw: WithdrawOperationDetail;
};

/**
 * Resolve detail shape for a given operation type.
 */
export type OperationDetailFor<TType extends OperationType> = TType extends keyof BuiltinOperationDetailByType
  ? BuiltinOperationDetailByType[TType]
  : Record<string, unknown>;

/**
 * Stored operation record as persisted by StorageAdapter implementations.
 */
export type StoredOperation<TDetail = Record<string, unknown>> = {
  id: string;
  type: OperationType;
  createdAt: number;
  chainId?: number;
  tokenId?: string;

  status: OperationStatus;
  requestUrl?: string;
  relayerTxHash?: `0x${string}`;
  txHash?: `0x${string}`;

  detail?: TDetail;
  error?: string;
};

/**
 * Input shape for creating a new operation record.
 */
export type OperationCreateInput<TType extends OperationType = OperationType> = Omit<
  StoredOperation<OperationDetailFor<TType>>,
  'id' | 'createdAt' | 'status'
> &
  Partial<Pick<StoredOperation<OperationDetailFor<TType>>, 'createdAt' | 'id' | 'status'>> & { type: TType };

/**
 * Generate a new operation id (uuid).
 */
export const newOperationId = () => globalThis.crypto.randomUUID();

export type DepositOperation = Omit<StoredOperation<DepositOperationDetail>, 'type'> & { type: 'deposit'; detail?: DepositOperationDetail };
export type TransferOperation = Omit<StoredOperation<TransferOperationDetail>, 'type'> & { type: 'transfer'; detail?: TransferOperationDetail };
export type WithdrawOperation = Omit<StoredOperation<WithdrawOperationDetail>, 'type'> & { type: 'withdraw'; detail?: WithdrawOperationDetail };
