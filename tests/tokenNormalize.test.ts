import { describe, expect, it } from 'vitest';
import { normalizeTokenMetadata } from '../src/ledger/tokenNormalize';

describe('normalizeTokenMetadata', () => {
  it('accepts sdk-style fields', () => {
    const token = normalizeTokenMetadata({
      id: '123',
      wrappedErc20: '0x00000000000000000000000000000000000000aa',
      viewerPk: ['1', '2'],
      freezerPk: ['3', '4'],
      depositFeeBps: 25,
      withdrawFeeBps: 50,
      transferMaxAmount: '1000',
      withdrawMaxAmount: 2000n,
      symbol: 'TKN',
      decimals: 18,
    });

    expect(token).toMatchObject({
      id: '123',
      wrappedErc20: '0x00000000000000000000000000000000000000aa',
      viewerPk: ['1', '2'],
      freezerPk: ['3', '4'],
      depositFeeBps: 25,
      withdrawFeeBps: 50,
      symbol: 'TKN',
      decimals: 18,
    });
  });

  it('accepts bigint key pairs', () => {
    const token = normalizeTokenMetadata({
      id: '456',
      wrappedErc20: '0x00000000000000000000000000000000000000bb',
      viewerPk: [1n, 2n],
      freezerPk: [3n, 4n],
      depositFeeBps: 10n,
      withdrawFeeBps: 20n,
      transferMaxAmount: 3000n,
      withdrawMaxAmount: 4000n,
      symbol: 'BGT',
      decimals: 6,
    });

    expect(token).toMatchObject({
      viewerPk: ['1', '2'],
      freezerPk: ['3', '4'],
      depositFeeBps: 10,
      withdrawFeeBps: 20,
    });
  });
});
