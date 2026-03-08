import { describe, expect, it } from 'vitest';
import { isHexStrict } from '../src/utils/hex';

describe('isHexStrict', () => {
  it('accepts valid hex strings', () => {
    expect(isHexStrict('0xab')).toBe(true);
    expect(isHexStrict('0xABCDEF0123456789')).toBe(true);
    expect(isHexStrict('0x00')).toBe(true);
  });

  it('rejects non-string input', () => {
    expect(isHexStrict(42)).toBe(false);
    expect(isHexStrict(null)).toBe(false);
    expect(isHexStrict(undefined)).toBe(false);
    expect(isHexStrict({})).toBe(false);
  });

  it('rejects strings without 0x prefix', () => {
    expect(isHexStrict('abcd')).toBe(false);
  });

  it('rejects empty payload (bare 0x)', () => {
    expect(isHexStrict('0x')).toBe(false);
  });

  it('rejects odd-length payload', () => {
    expect(isHexStrict('0xabc')).toBe(false);
    expect(isHexStrict('0x1')).toBe(false);
  });

  it('rejects non-hex characters', () => {
    expect(isHexStrict('0xgh')).toBe(false);
    expect(isHexStrict('0x00zz')).toBe(false);
  });

  it('enforces minBytes option', () => {
    expect(isHexStrict('0xab', { minBytes: 1 })).toBe(true);
    expect(isHexStrict('0xab', { minBytes: 2 })).toBe(false);
    expect(isHexStrict('0xaabbccdd', { minBytes: 4 })).toBe(true);
    expect(isHexStrict('0xaabb', { minBytes: 4 })).toBe(false);
  });
});
