import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Address } from 'viem';
import { LedgerInfo } from '../src/ledger/ledgerInfo';
import type { ChainConfigInput, TokenMetadata } from '../src/types';
import { SdkError } from '../src/errors';

const baseToken = (): TokenMetadata => ({
  id: 'OUSD',
  symbol: 'OUSD',
  decimals: 6,
  wrappedErc20: '0x0000000000000000000000000000000000000001' as Address,
  viewerPk: ['0x1', '0x2'],
  freezerPk: ['0x3', '0x4'],
});

const baseChain = (overrides: Partial<ChainConfigInput> = {}): ChainConfigInput => ({
  chainId: 11155111,
  contract: '0x0000000000000000000000000000000000001111' as Address,
  relayerUrl: 'https://relayer.ocash.xyz',
  tokens: [baseToken()],
  ...overrides,
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('LedgerInfo basics', () => {
  it('returns defensive copies of chains and tokens', () => {
    const ledger = new LedgerInfo([baseChain()]);
    const chain = ledger.getChain(11155111);
    chain.tokens[0].symbol = 'MUTATED';
    expect(ledger.getTokens(11155111)[0].symbol).toBe('OUSD');
  });

  it('appends and deduplicates tokens by id', () => {
    const ledger = new LedgerInfo([baseChain()]);
    const updatedToken = { ...baseToken(), id: 'OUSD', symbol: 'OUSD-NEW' };
    const freshToken = { ...baseToken(), id: 'USDT', symbol: 'USDT' };
    ledger.appendTokens(11155111, [updatedToken, freshToken]);
    const tokens = ledger.getTokens(11155111);
    expect(tokens).toHaveLength(2);
    expect(tokens.find((token) => token.id === 'OUSD')?.symbol).toBe('OUSD-NEW');
    expect(tokens.find((token) => token.id === 'USDT')).toBeDefined();
  });
});

describe('LedgerInfo.loadFromUrl', () => {
  it('hydrates new chains when the response is valid', async () => {
    const ledger = new LedgerInfo([]);
    const payload = {
      chains: [baseChain({ chainId: 5, contract: '0x0000000000000000000000000000000000000005' as Address })],
    };
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue({ ok: true, json: async () => payload } as Response);
    await ledger.loadFromUrl('https://example.com/ledger.json');
    expect(fetchSpy).toHaveBeenCalledWith('https://example.com/ledger.json');
    expect(ledger.getChain(5).contract).toBe('0x0000000000000000000000000000000000000005');
  });

  it('throws an SdkError when the response is not ok', async () => {
    const ledger = new LedgerInfo([]);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, status: 500 } as Response);
    await expect(ledger.loadFromUrl('https://example.com/ledger.json')).rejects.toBeInstanceOf(SdkError);
  });

  it('throws when the payload does not include a chain list', async () => {
    const ledger = new LedgerInfo([]);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({}),
    } as Response);
    await expect(ledger.loadFromUrl('https://example.com/ledger.json')).rejects.toBeInstanceOf(SdkError);
  });
});
