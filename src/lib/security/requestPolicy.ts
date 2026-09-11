export type RateLimitPolicy = {
  bucket: "ai" | "write" | "read";
  limit: number;
  windowMs: number;
};

export type RateLimitEntry = {
  count: number;
  resetAt: number;
};

export function getRateLimitPolicy(
  pathname: string,
  method: string,
  env: Record<string, string | undefined> = process.env,
): RateLimitPolicy {
  const windowMs = positiveInteger(env.STOCK_RATE_LIMIT_WINDOW_MS, 60_000);
  const normalizedMethod = method.toUpperCase();
  if (pathname.startsWith("/api/ai/") && !["GET", "HEAD", "OPTIONS"].includes(normalizedMethod)) {
    return { bucket: "ai", limit: positiveInteger(env.STOCK_RATE_LIMIT_AI_PER_MINUTE, 12), windowMs };
  }
  if (!["GET", "HEAD", "OPTIONS"].includes(normalizedMethod)) {
    return { bucket: "write", limit: positiveInteger(env.STOCK_RATE_LIMIT_WRITE_PER_MINUTE, 120), windowMs };
  }
  return { bucket: "read", limit: positiveInteger(env.STOCK_RATE_LIMIT_READ_PER_MINUTE, 360), windowMs };
}

export function getMaxRequestBytes(
  pathname: string,
  env: Record<string, string | undefined> = process.env,
) {
  const fallback = pathname === "/api/import/preview" ? 12 * 1024 * 1024 : 2 * 1024 * 1024;
  const configured = pathname === "/api/import/preview"
    ? env.STOCK_IMPORT_MAX_BYTES
    : env.STOCK_API_MAX_BODY_BYTES;
  return positiveInteger(configured, fallback);
}

export function consumeRateLimit(
  store: Map<string, RateLimitEntry>,
  key: string,
  policy: RateLimitPolicy,
  now = Date.now(),
) {
  const current = store.get(key);
  const entry = !current || current.resetAt <= now
    ? { count: 1, resetAt: now + policy.windowMs }
    : { count: current.count + 1, resetAt: current.resetAt };
  store.set(key, entry);
  return {
    allowed: entry.count <= policy.limit,
    limit: policy.limit,
    remaining: Math.max(0, policy.limit - entry.count),
    resetAt: entry.resetAt,
    retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - now) / 1_000)),
  };
}

export function parseBasicAuthorization(value: string | null) {
  if (!value?.startsWith("Basic ")) return null;
  try {
    const decoded = atob(value.slice(6));
    const separator = decoded.indexOf(":");
    if (separator < 0) return null;
    return { username: decoded.slice(0, separator), password: decoded.slice(separator + 1) };
  } catch {
    return null;
  }
}

export function safeEqual(left: string, right: string) {
  const length = Math.max(left.length, right.length);
  let mismatch = left.length ^ right.length;
  for (let index = 0; index < length; index += 1) {
    mismatch |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return mismatch === 0;
}

function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}
