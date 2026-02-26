import {
  BASE_MAINNET,
  BSC_MAINNET,
  BSC_TESTNET,
  ETH_MAINNET,
  SEPOLIA_TESTNET,
} from '../hooks/ocash/sdk-bridge';

export type OcashTokenConfig = {
  id: string;
  symbol: string;
  decimals: number;
  wrappedErc20: string;
  viewerPk: [string, string];
  freezerPk: [string, string];
  depositFeeBps?: number;
  withdrawFeeBps?: number;
  transferMaxAmount?: string;
  withdrawMaxAmount?: string;
};

export type OcashChainConfig = {
  chainId: string;
  chainIdDecimal: number;
  name: string;
  rpcUrl?: string;
  entryUrl?: string;
  merkleProofUrl?: string;
  relayerUrl?: string;
  ocashContractAddress?: string;
  tokens: OcashTokenConfig[];
};

function chainIdToHex(chainId: number): string {
  return `0x${chainId.toString(16)}`;
}

function toTokenConfigList(
  tokens: {
    id: string;
    symbol: string;
    decimals: number;
    wrappedErc20: string;
    viewerPk: [string, string];
    freezerPk: [string, string];
    depositFeeBps?: number;
    withdrawFeeBps?: number;
    transferMaxAmount?: bigint | string;
    withdrawMaxAmount?: bigint | string;
  }[] = [],
): OcashTokenConfig[] {
  return tokens.map((token) => ({
    id: token.id,
    symbol: token.symbol,
    decimals: token.decimals,
    wrappedErc20: token.wrappedErc20,
    viewerPk: token.viewerPk,
    freezerPk: token.freezerPk,
    depositFeeBps: token.depositFeeBps,
    withdrawFeeBps: token.withdrawFeeBps,
    transferMaxAmount:
      typeof token.transferMaxAmount === 'bigint'
        ? token.transferMaxAmount.toString()
        : token.transferMaxAmount,
    withdrawMaxAmount:
      typeof token.withdrawMaxAmount === 'bigint'
        ? token.withdrawMaxAmount.toString()
        : token.withdrawMaxAmount,
  }));
}

const CHAIN_NAME_MAP: Record<number, string> = {
  1: 'Ethereum',
  56: 'BNB Smart Chain',
  8453: 'Base',
  11155111: 'Sepolia',
  97: 'BSC Testnet',
};

const OCASH_CHAIN_CONFIGS: Record<string, OcashChainConfig> = [
  ETH_MAINNET,
  BSC_MAINNET,
  BASE_MAINNET,
  SEPOLIA_TESTNET,
  BSC_TESTNET,
].reduce((acc, chain) => {
  const chainIdHex = chainIdToHex(chain.chainId);
  acc[chainIdHex] = {
    chainId: chainIdHex,
    chainIdDecimal: chain.chainId,
    name: CHAIN_NAME_MAP[chain.chainId] ?? `Chain ${chain.chainId}`,
    rpcUrl: chain.rpcUrl,
    entryUrl: chain.entryUrl,
    merkleProofUrl: chain.merkleProofUrl,
    relayerUrl: chain.relayerUrl,
    ocashContractAddress: chain.ocashContractAddress,
    tokens: toTokenConfigList(chain.tokens),
  };
  return acc;
}, {} as Record<string, OcashChainConfig>);

export const OCASH_NATIVE_TOKEN_ADDRESS =
  '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';

function normalizeChainId(chainId: string | undefined): string | undefined {
  if (!chainId) {
    return undefined;
  }

  if (chainId.startsWith('eip155:')) {
    const [, decimalChainId] = chainId.split(':');
    const decimal = Number(decimalChainId);
    if (Number.isFinite(decimal)) {
      return `0x${decimal.toString(16)}`;
    }
  }

  if (/^\d+$/.test(chainId)) {
    const decimal = Number(chainId);
    if (Number.isFinite(decimal)) {
      return `0x${decimal.toString(16)}`;
    }
  }

  return chainId.toLowerCase();
}

function normalizeAddress(address: string | undefined): string | undefined {
  if (!address) {
    return undefined;
  }

  return address.toLowerCase();
}

export function getOcashChainConfig(
  chainId: string | undefined,
): OcashChainConfig | undefined {
  const normalizedChainId = normalizeChainId(chainId);
  if (!normalizedChainId) {
    return undefined;
  }

  return OCASH_CHAIN_CONFIGS[normalizedChainId];
}

export function isOcashSupportedChain(chainId: string | undefined): boolean {
  return Boolean(getOcashChainConfig(chainId));
}

export function getOcashTokenConfig(
  chainId: string | undefined,
  addressOrSymbol?: string,
): OcashTokenConfig | undefined {
  const chainConfig = getOcashChainConfig(chainId);
  if (!chainConfig) {
    return undefined;
  }

  const normalizedInput = normalizeAddress(addressOrSymbol);
  if (!normalizedInput) {
    return chainConfig.tokens.find(
      (token) =>
        normalizeAddress(token.wrappedErc20) === OCASH_NATIVE_TOKEN_ADDRESS,
    );
  }

  return chainConfig.tokens.find((token) => {
    const normalizedTokenAddress = normalizeAddress(token.wrappedErc20);
    return (
      normalizedTokenAddress === normalizedInput ||
      token.symbol.toLowerCase() === normalizedInput
    );
  });
}

export function getOcashTokenById(
  chainId: string | undefined,
  tokenId?: string,
): OcashTokenConfig | undefined {
  if (!tokenId) {
    return undefined;
  }
  const chainConfig = getOcashChainConfig(chainId);
  return chainConfig?.tokens.find((token) => token.id === tokenId);
}
