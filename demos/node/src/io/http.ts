export async function httpGetJson<T>(url: string, params?: Record<string, string | number | undefined>): Promise<T> {
  const u = new URL(url);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v == null) continue;
      u.searchParams.set(k, String(v));
    }
  }
  const res = await fetch(u);
  if (!res.ok) throw new Error(`HTTP ${res.status} GET ${u}`);
  return (await res.json()) as T;
}

export async function httpPostJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`HTTP ${res.status} POST ${url}`);
  return (await res.json()) as T;
}

