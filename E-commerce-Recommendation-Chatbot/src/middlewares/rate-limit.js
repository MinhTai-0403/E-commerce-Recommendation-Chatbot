const DEFAULT_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS || 60_000);
const DEFAULT_MAX = Number(process.env.RATE_LIMIT_AUTH_MAX || 10);

const buckets = new Map();

function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) return String(forwarded).split(",")[0].trim();
  return req.socket?.remoteAddress || "unknown";
}

function consumeRateLimit({ scope = "default", key = "", windowMs = DEFAULT_WINDOW_MS, max = DEFAULT_MAX } = {}) {
  const safeWindowMs = Number.isFinite(Number(windowMs)) ? Number(windowMs) : DEFAULT_WINDOW_MS;
  const safeMax = Number.isFinite(Number(max)) ? Number(max) : DEFAULT_MAX;
  const now = Date.now();
  const bucketKey = `${scope}:${key || "anonymous"}`;
  const current = buckets.get(bucketKey);

  if (!current || current.resetAt <= now) {
    buckets.set(bucketKey, {
      count: 1,
      resetAt: now + safeWindowMs,
    });
    return { ok: true, remaining: Math.max(0, safeMax - 1), retryAfterSeconds: 0 };
  }

  if (current.count >= safeMax) {
    return {
      ok: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
    };
  }

  current.count += 1;
  buckets.set(bucketKey, current);
  return {
    ok: true,
    remaining: Math.max(0, safeMax - current.count),
    retryAfterSeconds: 0,
  };
}

function rateLimitOrSend({ req, res, sendError, scope, identifier = "", windowMs, max, message } = {}) {
  const ip = getClientIp(req);
  const key = identifier ? `${ip}:${String(identifier).trim().toLowerCase()}` : ip;
  const result = consumeRateLimit({ scope, key, windowMs, max });

  if (!result.ok) {
    sendError(
      res,
      429,
      message || `Bạn thao tác quá nhanh. Vui lòng thử lại sau ${result.retryAfterSeconds} giây.`,
      { retryAfterSeconds: result.retryAfterSeconds }
    );
    return false;
  }

  return true;
}

module.exports = {
  consumeRateLimit,
  getClientIp,
  rateLimitOrSend,
};
