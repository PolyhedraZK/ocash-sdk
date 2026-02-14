import type { ChainConfigInput, RelayerConfig, TokenMetadata } from '../types';
import type { Address } from 'viem';
import { SdkError } from '../errors';
import { RelayerConfigManager } from './relayerConfig';
import { assertChainConfigInput, assertTokenMetadata } from './validate';

interface LedgerConfigResponse {
  chains?: ChainConfigInput[];
}

/**
 * Clone token list to prevent accidental external mutation.
 */
const cloneTokens = (tokens: TokenMetadata[]): TokenMetadata[] => tokens.map((token) => ({ ...token }));

/**
 * In-memory ledger registry for chain, token, and relayer configuration.
 * Acts as the canonical config source for assets APIs.
 */
export class LedgerInfo {
  private readonly chains = new Map<number, ChainConfigInput>();
  private readonly relayerManager: RelayerConfigManager;

  /**
   * Initialize with optional chain configs and prepare relayer manager.
   */
  constructor(initialChains: ChainConfigInput[] = []) {
    initialChains.forEach((chain) => this.upsertChain(chain));
    this.relayerManager = new RelayerConfigManager(() => this.getChains());
  }

  /**
   * Validate and upsert a chain config. Tokens are cloned defensively.
   */
  private upsertChain(chain: ChainConfigInput) {
    // Runtime validation: `ChainConfigInput` may come from JSON / JS hosts.
    assertChainConfigInput(chain, `chains[${chain.chainId}]`);
    const tokens = cloneTokens(chain.tokens ?? []);
    this.chains.set(chain.chainId, {
      ...chain,
      tokens,
    });
  }

  /**
   * Return all registered chains (deep-cloned token arrays).
   */
  getChains(): ChainConfigInput[] {
    return Array.from(this.chains.values()).map((chain) => ({
      ...chain,
      tokens: cloneTokens(chain.tokens || []),
    }));
  }

  /**
   * Lookup a chain by id. Throws if not registered.
   */
  getChain(chainId: number): ChainConfigInput {
    const chain = this.chains.get(chainId);
    if (!chain) {
      throw new SdkError('CONFIG', `Chain ${chainId} not found`);
    }
    return {
      ...chain,
      tokens: cloneTokens(chain.tokens || []),
    };
  }

  /**
   * Get token list for a chain (cloned).
   */
  getTokens(chainId: number): TokenMetadata[] {
    return this.getChain(chainId).tokens || [];
  }

  /**
   * Get token metadata for a specific pool id on a chain.
   */
  getPoolInfo(chainId: number, tokenId: string): TokenMetadata | undefined {
    return this.getTokens(chainId).find((token) => token.id === tokenId);
  }

  /**
   * Resolve the allowance target address for ERC20 approvals.
   * Uses ocashContractAddress, falling back to legacy contract field.
   */
  getAllowanceTarget(chainId: number): Address {
    const chain = this.getChain(chainId);
    const target = chain.ocashContractAddress ?? chain.contract;
    if (!target) {
      throw new SdkError('CONFIG', `Chain ${chainId} has no ocashContractAddress/contract`);
    }
    return target;
  }

  /**
   * Append/merge tokens into an existing chain.
   * Token ids are treated as unique keys and overwrite duplicates.
   */
  appendTokens(chainId: number, tokens: TokenMetadata[]) {
    const chain = this.chains.get(chainId);
    if (!chain) {
      throw new SdkError('CONFIG', `Chain ${chainId} not found`);
    }
    const tokenMap = new Map<string, TokenMetadata>();
    chain.tokens?.forEach((token) => {
      assertTokenMetadata(token, `chain(${chainId}).tokens(existing)`);
      tokenMap.set(token.id, { ...token });
    });
    tokens.forEach((token) => {
      assertTokenMetadata(token, `chain(${chainId}).tokens(append)`);
      tokenMap.set(token.id, { ...token });
    });
    chain.tokens = Array.from(tokenMap.values());
    this.chains.set(chainId, chain);
  }

  /**
   * Load ledger config from a remote JSON file and refresh relayer configs.
   */
  async loadFromUrl(url: string) {
    const response = await fetch(url);
    if (!response.ok) {
      throw new SdkError('ASSETS', `Failed to load ledger config from ${url}`, { status: response.status });
    }
    const payloadUnknown = (await response.json()) as unknown;
    const payload = payloadUnknown as LedgerConfigResponse;
    if (!payload || typeof payload !== 'object' || !Array.isArray(payload.chains)) {
      throw new SdkError('CONFIG', 'INVALID_LEDGER_CONFIG', payloadUnknown);
    }
    payload.chains.forEach((chain) => this.upsertChain(chain));
    await this.relayerManager.syncAll();
  }

  /**
   * Return cached relayer config (if present and fresh).
   */
  getRelayerConfig(chainId: number): RelayerConfig | undefined {
    return this.relayerManager.get(chainId);
  }

  /**
   * Fetch and cache relayer config for a single chain.
   */
  async syncRelayerConfig(chainId: number): Promise<RelayerConfig> {
    const chain = this.getChain(chainId);
    return this.relayerManager.sync(chain);
  }

  /**
   * Fetch and cache relayer configs for all chains.
   */
  async syncAllRelayerConfigs() {
    await this.relayerManager.syncAll();
  }
}
