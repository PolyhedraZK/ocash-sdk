import type { ChainConfigInput, RelayerConfig, TokenMetadata } from '../types';
import type { Address } from 'viem';
import { SdkError } from '../errors';
import { RelayerConfigManager } from './relayerConfig';
import { assertChainConfigInput, assertTokenMetadata } from './validate';

interface LedgerConfigResponse {
  chains?: ChainConfigInput[];
}

const cloneTokens = (tokens: TokenMetadata[]): TokenMetadata[] => tokens.map((token) => ({ ...token }));

export class LedgerInfo {
  private readonly chains = new Map<number, ChainConfigInput>();
  private readonly relayerManager: RelayerConfigManager;

  constructor(initialChains: ChainConfigInput[] = []) {
    initialChains.forEach((chain) => this.upsertChain(chain));
    this.relayerManager = new RelayerConfigManager(() => this.getChains());
  }

  private upsertChain(chain: ChainConfigInput) {
    // Runtime validation: `ChainConfigInput` may come from JSON / JS hosts.
    assertChainConfigInput(chain, `chains[${chain.chainId}]`);
    const tokens = cloneTokens(chain.tokens ?? []);
    this.chains.set(chain.chainId, {
      ...chain,
      tokens,
    });
  }

  getChains(): ChainConfigInput[] {
    return Array.from(this.chains.values()).map((chain) => ({
      ...chain,
      tokens: cloneTokens(chain.tokens || []),
    }));
  }

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

  getTokens(chainId: number): TokenMetadata[] {
    return this.getChain(chainId).tokens || [];
  }

  getPoolInfo(chainId: number, tokenId: string): TokenMetadata | undefined {
    return this.getTokens(chainId).find((token) => token.id === tokenId);
  }

  getAllowanceTarget(chainId: number): Address {
    const chain = this.getChain(chainId);
    const target = chain.ocashContractAddress ?? chain.contract;
    if (!target) {
      throw new SdkError('CONFIG', `Chain ${chainId} has no ocashContractAddress/contract`);
    }
    return target;
  }

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

  async loadFromUrl(url: string) {
    const response = await fetch(url);
    if (!response.ok) {
      throw new SdkError('ASSETS', `Failed to load ledger config from ${url}`, { status: response.status });
    }
    const payloadUnknown = (await response.json()) as unknown;
    const payload = payloadUnknown as LedgerConfigResponse;
    if (!payload || typeof payload !== 'object' || !Array.isArray((payload as any).chains)) {
      throw new SdkError('CONFIG', 'INVALID_LEDGER_CONFIG', payloadUnknown);
    }
    (payload as any).chains.forEach((chain: unknown) => this.upsertChain(chain as ChainConfigInput));
    await this.relayerManager.syncAll();
  }

  getRelayerConfig(chainId: number): RelayerConfig | undefined {
    return this.relayerManager.get(chainId);
  }

  async syncRelayerConfig(chainId: number): Promise<RelayerConfig> {
    const chain = this.getChain(chainId);
    return this.relayerManager.sync(chain);
  }

  async syncAllRelayerConfigs() {
    await this.relayerManager.syncAll();
  }
}
