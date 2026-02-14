/**
 * OCash contract ABI (functions/events/errors) used by the SDK.
 * This is a trimmed Foundry ABI without internalType/constructor/receive.
 */
export const App_ABI = [
  {
    type: 'function',
    name: 'DomainArray',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'uint256',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'DomainMerkle',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'uint256',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'DomainNullifier',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'uint256',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'DomainPolicy',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'uint256',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'DomainRecord',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'uint256',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'FREEZE_VERIFIER',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'address',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'NATIVE_TOKEN_ADDRESS',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'address',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'POSEIDON2',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'address',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'TRANSFER_VERIFIER',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'address',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'WITHDRAW_VERIFIER',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'address',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'accumulatedRelayerFees',
    inputs: [
      {
        name: '',
        type: 'address',
      },
      {
        name: '',
        type: 'address',
      },
    ],
    outputs: [
      {
        name: '',
        type: 'uint128',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'array',
    inputs: [
      {
        name: '',
        type: 'uint256',
      },
    ],
    outputs: [
      {
        name: '',
        type: 'uint256',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'arrayHashes',
    inputs: [
      {
        name: '',
        type: 'uint256',
      },
    ],
    outputs: [
      {
        name: '',
        type: 'uint256',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'arraySize',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'uint256',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'claimProtocolFees',
    inputs: [
      {
        name: 'poolId',
        type: 'uint256',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'claimRelayerFees',
    inputs: [
      {
        name: 'token',
        type: 'address',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'commitments',
    inputs: [
      {
        name: '',
        type: 'uint256',
      },
    ],
    outputs: [
      {
        name: '',
        type: 'bool',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'deposit',
    inputs: [
      {
        name: 'poolId',
        type: 'uint256',
      },
      {
        name: 'amount',
        type: 'uint128',
      },
      {
        name: 'userPK',
        type: 'uint256[2]',
      },
      {
        name: 'nonce',
        type: 'uint256',
      },
      {
        name: '',
        type: 'bytes',
      },
    ],
    outputs: [],
    stateMutability: 'payable',
  },
  {
    type: 'function',
    name: 'depositRelayerFee',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'uint128',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'digest',
    inputs: [],
    outputs: [
      {
        name: 'merkleTreeRoot',
        type: 'uint256',
      },
      {
        name: 'currentArrayHash',
        type: 'uint256',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'freeze',
    inputs: [
      {
        name: 'poolId',
        type: 'uint256',
      },
      {
        name: 'merkleRootIndex',
        type: 'uint256',
      },
      {
        name: 'arrayHashIndex',
        type: 'uint256',
      },
      {
        name: 'inputNullifiers',
        type: 'uint256[3]',
      },
      {
        name: 'outputs',
        type: 'uint256[3]',
      },
      {
        name: 'proof',
        type: 'uint256[8]',
      },
      {
        name: 'viewerData',
        type: 'uint256[17]',
      },
      {
        name: 'extraData',
        type: 'bytes',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'frontier',
    inputs: [
      {
        name: '',
        type: 'uint256',
      },
    ],
    outputs: [
      {
        name: '',
        type: 'uint256',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getArray',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'uint256[]',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getLastArrayHash',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'uint256',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getLastRoot',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'uint256',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getPendingDepositsCount',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'uint256',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getPoolInfo',
    inputs: [
      {
        name: 'poolId',
        type: 'uint256',
      },
    ],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          {
            name: 'token',
            type: 'address',
          },
          {
            name: 'depositFeeBPS',
            type: 'uint16',
          },
          {
            name: 'withdrawFeeBPS',
            type: 'uint16',
          },
          {
            name: 'accumulatedFee',
            type: 'uint128',
          },
          {
            name: 'viewerPK',
            type: 'uint256[2]',
          },
          {
            name: 'freezerPK',
            type: 'uint256[2]',
          },
          {
            name: 'transferMaxAmount',
            type: 'uint128',
          },
          {
            name: 'withdrawMaxAmount',
            type: 'uint128',
          },
        ],
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'initialize',
    inputs: [
      {
        name: '_depositRelayerFee',
        type: 'uint128',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'merkleRoots',
    inputs: [
      {
        name: '',
        type: 'uint256',
      },
    ],
    outputs: [
      {
        name: '',
        type: 'uint256',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'nullifiers',
    inputs: [
      {
        name: '',
        type: 'uint256',
      },
    ],
    outputs: [
      {
        name: '',
        type: 'bool',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'owner',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'address',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'pendingDepositsProcessed',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'uint256',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'pendingDepositsQueue',
    inputs: [
      {
        name: '',
        type: 'uint256',
      },
    ],
    outputs: [
      {
        name: 'leaf',
        type: 'uint256',
      },
      {
        name: 'relayerFee',
        type: 'uint128',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'poolIds',
    inputs: [
      {
        name: '',
        type: 'uint256',
      },
    ],
    outputs: [
      {
        name: '',
        type: 'uint256',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'pools',
    inputs: [
      {
        name: '',
        type: 'uint256',
      },
    ],
    outputs: [
      {
        name: 'token',
        type: 'address',
      },
      {
        name: 'depositFeeBPS',
        type: 'uint16',
      },
      {
        name: 'withdrawFeeBPS',
        type: 'uint16',
      },
      {
        name: 'accumulatedFee',
        type: 'uint128',
      },
      {
        name: 'transferMaxAmount',
        type: 'uint128',
      },
      {
        name: 'withdrawMaxAmount',
        type: 'uint128',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'processPendingDeposits',
    inputs: [
      {
        name: 'maxBatchSize',
        type: 'uint256',
      },
      {
        name: 'relayer',
        type: 'address',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'registerPool',
    inputs: [
      {
        name: 'token',
        type: 'address',
      },
      {
        name: 'depositFeeBPS',
        type: 'uint16',
      },
      {
        name: 'withdrawFeeBPS',
        type: 'uint16',
      },
      {
        name: 'transferMaxAmount',
        type: 'uint128',
      },
      {
        name: 'withdrawMaxAmount',
        type: 'uint128',
      },
      {
        name: 'viewerPK',
        type: 'uint256[2]',
      },
      {
        name: 'freezerPK',
        type: 'uint256[2]',
      },
    ],
    outputs: [
      {
        name: '',
        type: 'uint256',
      },
    ],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'registerUser',
    inputs: [
      {
        name: 'userKey',
        type: 'bytes',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'renounceOwnership',
    inputs: [],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'setDepositRelayerFee',
    inputs: [
      {
        name: '_depositRelayerFee',
        type: 'uint128',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'setPoolFees',
    inputs: [
      {
        name: 'poolId',
        type: 'uint256',
      },
      {
        name: 'depositFeeBPS',
        type: 'uint16',
      },
      {
        name: 'withdrawFeeBPS',
        type: 'uint16',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'setPoolLimits',
    inputs: [
      {
        name: 'poolId',
        type: 'uint256',
      },
      {
        name: 'transferMaxAmount',
        type: 'uint128',
      },
      {
        name: 'withdrawMaxAmount',
        type: 'uint128',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'totalElements',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'uint256',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'totalElementsInTree',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'uint256',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'totalPools',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'uint256',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'transfer',
    inputs: [
      {
        name: 'poolId',
        type: 'uint256',
      },
      {
        name: 'merkleRootIndex',
        type: 'uint256',
      },
      {
        name: 'arrayHashIndex',
        type: 'uint256',
      },
      {
        name: 'inputNullifiers',
        type: 'uint256[3]',
      },
      {
        name: 'outputs',
        type: 'uint256[3]',
      },
      {
        name: 'proof',
        type: 'uint256[8]',
      },
      {
        name: 'viewerData',
        type: 'uint256[17]',
      },
      {
        name: 'extraData',
        type: 'bytes',
      },
      {
        name: 'relayer',
        type: 'address',
      },
      {
        name: 'relayerFee',
        type: 'uint128',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'transferOwnership',
    inputs: [
      {
        name: 'newOwner',
        type: 'address',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'userKeys',
    inputs: [
      {
        name: '',
        type: 'address',
      },
    ],
    outputs: [
      {
        name: '',
        type: 'bytes',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'withdraw',
    inputs: [
      {
        name: 'inp',
        type: 'tuple',
        components: [
          {
            name: 'poolId',
            type: 'uint256',
          },
          {
            name: 'merkleRootIndex',
            type: 'uint256',
          },
          {
            name: 'arrayHashIndex',
            type: 'uint256',
          },
          {
            name: 'inputNullifier',
            type: 'uint256',
          },
          {
            name: 'output',
            type: 'uint256',
          },
          {
            name: 'recipient',
            type: 'address',
          },
          {
            name: 'amount',
            type: 'uint128',
          },
          {
            name: 'proof',
            type: 'uint256[8]',
          },
          {
            name: 'viewerData',
            type: 'uint256[7]',
          },
          {
            name: 'extraData',
            type: 'bytes',
          },
          {
            name: 'relayer',
            type: 'address',
          },
          {
            name: 'relayerFee',
            type: 'uint128',
          },
          {
            name: 'gasDropValue',
            type: 'uint128',
          },
        ],
      },
    ],
    outputs: [],
    stateMutability: 'payable',
  },
  {
    type: 'event',
    name: 'ArrayMergedToTree',
    inputs: [
      {
        name: 'batchIndex',
        type: 'uint256',
        indexed: true,
      },
      {
        name: 'newRoot',
        type: 'uint256',
        indexed: true,
      },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'Deposit',
    inputs: [
      {
        name: 'poolId',
        type: 'uint256',
        indexed: true,
      },
      {
        name: 'from',
        type: 'address',
        indexed: true,
      },
      {
        name: 'amount',
        type: 'uint128',
        indexed: false,
      },
      {
        name: 'fee',
        type: 'uint128',
        indexed: false,
      },
      {
        name: 'userPK',
        type: 'uint256[2]',
        indexed: false,
      },
      {
        name: 'nonce',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'relayerFee',
        type: 'uint128',
        indexed: false,
      },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'DepositQueued',
    inputs: [
      {
        name: 'queueIndex',
        type: 'uint256',
        indexed: true,
      },
      {
        name: 'leaf',
        type: 'uint256',
        indexed: true,
      },
      {
        name: 'relayerFee',
        type: 'uint128',
        indexed: false,
      },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'DepositRelayerFeeUpdated',
    inputs: [
      {
        name: 'depositRelayerFee',
        type: 'uint128',
        indexed: false,
      },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'DepositsProcessed',
    inputs: [
      {
        name: 'fromIndex',
        type: 'uint256',
        indexed: true,
      },
      {
        name: 'toIndex',
        type: 'uint256',
        indexed: true,
      },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'ElementInserted',
    inputs: [
      {
        name: 'element',
        type: 'uint256',
        indexed: true,
      },
      {
        name: 'globalIndex',
        type: 'uint256',
        indexed: true,
      },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'Freeze',
    inputs: [
      {
        name: 'poolId',
        type: 'uint256',
        indexed: true,
      },
      {
        name: 'merkleRoot',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'arrayHash',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'inputs',
        type: 'uint256[3]',
        indexed: false,
      },
      {
        name: 'outputs',
        type: 'uint256[3]',
        indexed: false,
      },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'Initialized',
    inputs: [
      {
        name: 'version',
        type: 'uint64',
        indexed: false,
      },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'OwnershipTransferred',
    inputs: [
      {
        name: 'previousOwner',
        type: 'address',
        indexed: true,
      },
      {
        name: 'newOwner',
        type: 'address',
        indexed: true,
      },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'PoolFeesUpdated',
    inputs: [
      {
        name: 'poolId',
        type: 'uint256',
        indexed: true,
      },
      {
        name: 'depositFeeBPS',
        type: 'uint16',
        indexed: false,
      },
      {
        name: 'withdrawFeeBPS',
        type: 'uint16',
        indexed: false,
      },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'PoolLimitsUpdated',
    inputs: [
      {
        name: 'poolId',
        type: 'uint256',
        indexed: true,
      },
      {
        name: 'transferMaxAmount',
        type: 'uint128',
        indexed: false,
      },
      {
        name: 'withdrawMaxAmount',
        type: 'uint128',
        indexed: false,
      },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'PoolRegistered',
    inputs: [
      {
        name: 'poolId',
        type: 'uint256',
        indexed: true,
      },
      {
        name: 'token',
        type: 'address',
        indexed: true,
      },
      {
        name: 'viewerPK',
        type: 'uint256[2]',
        indexed: false,
      },
      {
        name: 'freezerPK',
        type: 'uint256[2]',
        indexed: false,
      },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'ProtocolFeesClaimed',
    inputs: [
      {
        name: 'poolId',
        type: 'uint256',
        indexed: true,
      },
      {
        name: 'recipient',
        type: 'address',
        indexed: true,
      },
      {
        name: 'amount',
        type: 'uint128',
        indexed: false,
      },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'RelayerFeesClaimed',
    inputs: [
      {
        name: 'relayer',
        type: 'address',
        indexed: true,
      },
      {
        name: 'token',
        type: 'address',
        indexed: true,
      },
      {
        name: 'amount',
        type: 'uint128',
        indexed: false,
      },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'Transfer',
    inputs: [
      {
        name: 'poolId',
        type: 'uint256',
        indexed: true,
      },
      {
        name: 'merkleRoot',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'arrayHash',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'inputs',
        type: 'uint256[3]',
        indexed: false,
      },
      {
        name: 'outputs',
        type: 'uint256[3]',
        indexed: false,
      },
      {
        name: 'relayer',
        type: 'address',
        indexed: true,
      },
      {
        name: 'relayerFee',
        type: 'uint128',
        indexed: false,
      },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'UserRegistered',
    inputs: [
      {
        name: 'user',
        type: 'address',
        indexed: true,
      },
      {
        name: 'userKey',
        type: 'bytes',
        indexed: false,
      },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'Withdraw',
    inputs: [
      {
        name: 'poolId',
        type: 'uint256',
        indexed: true,
      },
      {
        name: 'merkleRoot',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'arrayHash',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'input',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'output',
        type: 'uint256',
        indexed: false,
      },
      {
        name: 'recipient',
        type: 'address',
        indexed: true,
      },
      {
        name: 'amount',
        type: 'uint128',
        indexed: false,
      },
      {
        name: 'protocolFee',
        type: 'uint128',
        indexed: false,
      },
      {
        name: 'relayer',
        type: 'address',
        indexed: true,
      },
      {
        name: 'relayerFee',
        type: 'uint128',
        indexed: false,
      },
      {
        name: 'gasDropValue',
        type: 'uint128',
        indexed: false,
      },
    ],
    anonymous: false,
  },
  {
    type: 'error',
    name: 'AddressIsZero',
    inputs: [],
  },
  {
    type: 'error',
    name: 'DataNotInField',
    inputs: [
      {
        name: 'data',
        type: 'uint256',
      },
    ],
  },
  {
    type: 'error',
    name: 'DuplicateCommitment',
    inputs: [
      {
        name: 'commitment',
        type: 'uint256',
      },
    ],
  },
  {
    type: 'error',
    name: 'ExceedsWithdrawLimit',
    inputs: [
      {
        name: 'amount',
        type: 'uint128',
      },
      {
        name: 'maxAmount',
        type: 'uint128',
      },
    ],
  },
  {
    type: 'error',
    name: 'FailedCall',
    inputs: [],
  },
  {
    type: 'error',
    name: 'FeeBPSOutOfBounds',
    inputs: [
      {
        name: 'feeBPS',
        type: 'uint16',
      },
    ],
  },
  {
    type: 'error',
    name: 'InsufficientBalance',
    inputs: [
      {
        name: 'balance',
        type: 'uint256',
      },
      {
        name: 'needed',
        type: 'uint256',
      },
    ],
  },
  {
    type: 'error',
    name: 'InvalidArrayHashIndex',
    inputs: [
      {
        name: 'provided',
        type: 'uint256',
      },
    ],
  },
  {
    type: 'error',
    name: 'InvalidBatchSize',
    inputs: [],
  },
  {
    type: 'error',
    name: 'InvalidETHAmount',
    inputs: [
      {
        name: 'expected',
        type: 'uint128',
      },
      {
        name: 'actual',
        type: 'uint256',
      },
    ],
  },
  {
    type: 'error',
    name: 'InvalidGasDropValue',
    inputs: [
      {
        name: 'provided',
        type: 'uint256',
      },
    ],
  },
  {
    type: 'error',
    name: 'InvalidInitialization',
    inputs: [],
  },
  {
    type: 'error',
    name: 'InvalidMerkleRootIndex',
    inputs: [
      {
        name: 'provided',
        type: 'uint256',
      },
    ],
  },
  {
    type: 'error',
    name: 'InvalidPoolId',
    inputs: [
      {
        name: 'poolId',
        type: 'uint256',
      },
    ],
  },
  {
    type: 'error',
    name: 'InvalidRelayerFee',
    inputs: [
      {
        name: 'provided',
        type: 'uint256',
      },
    ],
  },
  {
    type: 'error',
    name: 'NoElementsInArray',
    inputs: [],
  },
  {
    type: 'error',
    name: 'NoPendingDeposits',
    inputs: [],
  },
  {
    type: 'error',
    name: 'NotInitializing',
    inputs: [],
  },
  {
    type: 'error',
    name: 'NullifierAlreadyPublished',
    inputs: [
      {
        name: 'nullifier',
        type: 'uint256',
      },
    ],
  },
  {
    type: 'error',
    name: 'NullifierIsZero',
    inputs: [],
  },
  {
    type: 'error',
    name: 'OutputIsZero',
    inputs: [],
  },
  {
    type: 'error',
    name: 'OwnableInvalidOwner',
    inputs: [
      {
        name: 'owner',
        type: 'address',
      },
    ],
  },
  {
    type: 'error',
    name: 'OwnableUnauthorizedAccount',
    inputs: [
      {
        name: 'account',
        type: 'address',
      },
    ],
  },
  {
    type: 'error',
    name: 'PoolAlreadyExists',
    inputs: [
      {
        name: 'poolId',
        type: 'uint256',
      },
    ],
  },
  {
    type: 'error',
    name: 'ReentrancyGuardReentrantCall',
    inputs: [],
  },
  {
    type: 'error',
    name: 'RelayerAddressIsZero',
    inputs: [],
  },
  {
    type: 'error',
    name: 'SafeERC20FailedOperation',
    inputs: [
      {
        name: 'token',
        type: 'address',
      },
    ],
  },
  {
    type: 'error',
    name: 'TreeIsFull',
    inputs: [],
  },
  {
    type: 'error',
    name: 'Unauthorized',
    inputs: [
      {
        name: 'owner',
        type: 'address',
      },
      {
        name: 'caller',
        type: 'address',
      },
    ],
  },
] as const;
