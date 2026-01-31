import { describe, expect, it } from 'vitest';
import { normalizeTokenMetadata } from '../src/ledger/tokenNormalize';

describe('normalizeTokenMetadata', () => {
  it('accepts app-style fields', () => {
    const token = normalizeTokenMetadata({
      id: '123',
      wrapped_erc20: '0x00000000000000000000000000000000000000aa',
      viewerPK: ['1', '2'],
      freezerPK: ['3', '4'],
      depositFeeBPS: 25,
      withdrawFeeBPS: 50,
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
});

