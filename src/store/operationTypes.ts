export type OperationStatus = 'created' | 'submitted' | 'confirmed' | 'failed';

export type OperationType = 'deposit' | 'transfer' | 'withdraw' | (string & {});

type Hex = `0x${string}`;

export type ListOperationsQuery = {
  limit?: number;
  offset?: number;
  chainId?: number;
  tokenId?: string;
  type?: OperationType | OperationType[];
  status?: OperationStatus | OperationStatus[];
  sort?: 'desc' | 'asc';
};

export type DepositOperationDetail = {
  token: string;
  amount: string;
  protocolFee?: string;
  depositRelayerFee?: string;
  inputCommitments?: Hex[];
  outputCommitments?: Hex[];
};

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

export type BuiltinOperationDetailByType = {
  deposit: DepositOperationDetail;
  transfer: TransferOperationDetail;
  withdraw: WithdrawOperationDetail;
};

export type OperationDetailFor<TType extends OperationType> = TType extends keyof BuiltinOperationDetailByType
  ? BuiltinOperationDetailByType[TType]
  : Record<string, unknown>;

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

export type OperationCreateInput<TType extends OperationType = OperationType> = Omit<
  StoredOperation<OperationDetailFor<TType>>,
  'id' | 'createdAt' | 'status'
> &
  Partial<Pick<StoredOperation<OperationDetailFor<TType>>, 'createdAt' | 'id' | 'status'>> & { type: TType };

export const newOperationId = () => globalThis.crypto.randomUUID();

export type DepositOperation = Omit<StoredOperation<DepositOperationDetail>, 'type'> & { type: 'deposit'; detail?: DepositOperationDetail };
export type TransferOperation = Omit<StoredOperation<TransferOperationDetail>, 'type'> & { type: 'transfer'; detail?: TransferOperationDetail };
export type WithdrawOperation = Omit<StoredOperation<WithdrawOperationDetail>, 'type'> & { type: 'withdraw'; detail?: WithdrawOperationDetail };
