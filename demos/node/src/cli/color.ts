const useColor = () => {
  if (process.env.NO_COLOR != null) return false;
  if (process.env.FORCE_COLOR === '0') return false;
  return Boolean(process.stdout.isTTY);
};

const wrap = (open: string, close: string) => (text: unknown) => {
  const s = String(text);
  if (!useColor()) return s;
  return `${open}${s}${close}`;
};

export const c = {
  dim: wrap('\x1b[2m', '\x1b[0m'),
  gray: wrap('\x1b[90m', '\x1b[0m'),
  red: wrap('\x1b[31m', '\x1b[0m'),
  yellow: wrap('\x1b[33m', '\x1b[0m'),
  green: wrap('\x1b[32m', '\x1b[0m'),
  cyan: wrap('\x1b[36m', '\x1b[0m'),
  magenta: wrap('\x1b[35m', '\x1b[0m'),
  bold: wrap('\x1b[1m', '\x1b[0m'),
} as const;

