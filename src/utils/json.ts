export const bigintReplacer = (_key: string, value: unknown) => {
  if (typeof value === 'bigint') {
    return value.toString();
  }
  return value;
};

export const serializeBigInt = <T>(value: T): string => JSON.stringify(value, bigintReplacer);

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (value == null || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
};

const stable = (value: unknown): unknown => {
  if (value == null) return value;
  if (Array.isArray(value)) return value.map((v) => stable(v));
  if (!isPlainObject(value)) return value;
  const obj = value;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(obj).sort()) {
    const v = obj[key];
    if (v === undefined) continue;
    out[key] = stable(v);
  }
  return out;
};

export const stableStringify = (value: unknown): string => JSON.stringify(stable(value), bigintReplacer);
