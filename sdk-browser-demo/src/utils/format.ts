const pow10 = (exp: number) => 10n ** BigInt(exp);

export function parseAmount(value: string, decimals: number) {
  const trimmed = value.trim();
  if (!trimmed) throw new Error('amount is empty');
  if (trimmed.startsWith('-')) throw new Error('amount must be positive');

  const [whole, frac = ''] = trimmed.split('.');
  if (!/^\d+$/.test(whole || '0')) throw new Error(`invalid amount: ${value}`);
  if (!/^\d*$/.test(frac)) throw new Error(`invalid amount: ${value}`);
  if (frac.length > decimals) throw new Error(`too many decimals (max ${decimals}): ${value}`);

  const wholePart = BigInt(whole || '0') * pow10(decimals);
  const fracPadded = (frac + '0'.repeat(decimals)).slice(0, decimals);
  const fracPart = BigInt(fracPadded || '0');
  return wholePart + fracPart;
}

export function formatAmount(value: bigint, decimals: number) {
  const sign = value < 0n ? '-' : '';
  const abs = value < 0n ? -value : value;
  const base = pow10(decimals);
  const whole = abs / base;
  const frac = abs % base;
  if (decimals === 0) return `${sign}${whole.toString()}`;
  const fracStr = frac.toString().padStart(decimals, '0').replace(/0+$/, '');
  return fracStr ? `${sign}${whole.toString()}.${fracStr}` : `${sign}${whole.toString()}`;
}
