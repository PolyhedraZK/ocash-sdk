import type { ChainConfigInput, RelayerConfig } from '../types';
import { SdkError } from '../errors';

const RELAYER_ENDPOINT = '/api/v1/relayer_config';

const normalizeRelayerConfig = (payload: RelayerConfig): RelayerConfig => {
  return {
    ...payload,
    fee_configure: {
      valid_time: payload.fee_configure.valid_time,
      transfer: payload.fee_configure.transfer || {},
      withdraw: payload.fee_configure.withdraw || {},
    },
    fetched_at: Date.now(),
  };
};

export const fetchRelayerConfigFromRelayerUrl = async (
  relayerUrl: string,
  options?: { signal?: AbortSignal },
): Promise<RelayerConfig> => {
  const url = `${relayerUrl.replace(/\/$/, '')}${RELAYER_ENDPOINT}`;
  const response = await fetch(url, { signal: options?.signal });
  if (!response.ok) {
    throw new SdkError('ASSETS', 'Failed to fetch relayer config', { status: response.status, url });
  }
  const payload = (await response.json()) as RelayerConfig;
  return normalizeRelayerConfig(payload);
};

export class RelayerConfigManager {
  private readonly cache = new Map<number, RelayerConfig>();

  constructor(private readonly getChains: () => ChainConfigInput[]) {}

  private resolveChain(chainId: number): ChainConfigInput {
    const chain = this.getChains().find((entry) => entry.chainId === chainId);
    if (!chain) {
      throw new SdkError('CONFIG', `Chain ${chainId} not found when syncing relayer config`);
    }
    return chain;
  }

  private async fetchConfig(url: string): Promise<RelayerConfig> {
    const response = await fetch(url);
    if (!response.ok) throw new SdkError('ASSETS', 'Failed to fetch relayer config', { status: response.status, url });
    const payload = (await response.json()) as RelayerConfig;
    return normalizeRelayerConfig(payload);
  }

  private normalizeUrl(relayerUrl: string) {
    return `${relayerUrl.replace(/\/$/, '')}${RELAYER_ENDPOINT}`;
  }

  async sync(chainOrId: ChainConfigInput | number): Promise<RelayerConfig> {
    const chain = typeof chainOrId === 'number' ? this.resolveChain(chainOrId) : chainOrId;
    if (!chain.relayerUrl) {
      throw new SdkError('CONFIG', `Chain ${chain.chainId} has no relayerUrl`);
    }
    const url = this.normalizeUrl(chain.relayerUrl);
    const config = await this.fetchConfig(url);
    this.cache.set(chain.chainId, config);
    return config;
  }

  get(chainId: number): RelayerConfig | undefined {
    const cached = this.cache.get(chainId);
    if (!cached) return undefined;
    const validDuration = 5 * 60 * 1000;
    if (cached.fetched_at && Date.now() - cached.fetched_at > validDuration) {
      this.cache.delete(chainId);
      return undefined;
    }
    return cached;
  }

  async syncAll() {
    await Promise.all(this.getChains().map((chain) => this.sync(chain).catch(() => undefined)));
  }
}
