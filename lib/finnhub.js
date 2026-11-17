// Server-only API access. Tokens stay in request headers, never in URLs or client props.
const state = globalThis.finnhubState ??= { cache: new Map(), requests: [], backoff: 0 };

export const finnhubEnabled = () => Boolean(process.env.FINNHUB_API_KEY);

export async function finnhubRequest(path, { ttl = 60000, priority = false } = {}) {
  const key = process.env.FINNHUB_API_KEY;
  if (!key) throw new Error("not_configured");
  const now = Date.now();
  const cached = state.cache.get(path);
  if (cached && cached.expires > now) return cached.promise;
  state.requests = state.requests.filter((time) => time > now - 60000);
  // Leave room for holdings quotes; research enrichment has a smaller budget.
  if (state.backoff > now || state.requests.length >= (priority ? 45 : 25)) throw new Error("rate_limit");
  state.requests.push(now);
  const entry = { expires: now + ttl };
  entry.promise = (async () => {
    try {
      const response = await fetch(`https://finnhub.io/api/v1${path}`, {
        headers: { "X-Finnhub-Token": key }, cache: "no-store", signal: AbortSignal.timeout(5000),
      });
      if (response.status === 429) { state.backoff = Date.now() + 60000; throw new Error("rate_limit"); }
      if (response.status === 401 || response.status === 403) throw new Error("access_denied");
      if (!response.ok) throw new Error("unavailable");
      const data = await response.json();
      if (data.error) throw new Error("unavailable");
      return data;
    } catch (error) {
      // Cache failures briefly too, avoiding repeat calls on parallel page loads.
      entry.expires = Date.now() + 15000;
      throw error;
    }
  })();
  state.cache.set(path, entry);
  if (state.cache.size > 500) for (const [id, value] of state.cache) if (value.expires <= now) state.cache.delete(id);
  return entry.promise;
}

export async function finnhubQuote(symbol, priority = true) {
  if (!/^[A-Z][A-Z0-9-]{0,14}$/.test(symbol)) throw new Error("unsupported");
  const q = await finnhubRequest(`/quote?symbol=${encodeURIComponent(symbol)}`, { priority });
  if (!Number.isFinite(q.c) || q.c <= 0 || !Number.isFinite(q.t) || q.t <= 0) throw new Error("no_quote");
  return q;
}
