export function parseArgs(argv: string[]) {
  const flags: Record<string, string | boolean> = {};
  const positionals: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const cur = argv[i]!;
    if (cur === '--') {
      positionals.push(...argv.slice(i + 1));
      break;
    }
    if (!cur.startsWith('--')) {
      positionals.push(cur);
      continue;
    }
    const key = cur.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      flags[key] = true;
      continue;
    }
    flags[key] = next;
    i++;
  }
  return { flags, positionals };
}
