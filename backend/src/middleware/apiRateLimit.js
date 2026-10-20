
import redisClient from "../config/redis.js";

const DEFAULT_MAX_REQUESTS = 100;
const DEFAULT_WINDOW_MS = 60_000;

// Atomically increment the counter and set its expiration.
const RATE_LIMIT_SCRIPT = `
  local count = redis.call("INCR", KEYS[1])

  if count == 1 then
    redis.call("PEXPIRE", KEYS[1], ARGV[1])
  end

  local ttl = redis.call("PTTL", KEYS[1])

  return { count, ttl }
`;

export function createApiRateLimit({
  maxRequests = Number(
    process.env.API_RATE_LIMIT_MAX ?? DEFAULT_MAX_REQUESTS
  ),
  windowMs = Number(
    process.env.API_RATE_LIMIT_WINDOW_MS ?? DEFAULT_WINDOW_MS
  )
} = {}) {
  if (!Number.isSafeInteger(maxRequests) || maxRequests < 1) {
    throw new TypeError("maxRequests must be a positive integer.");
  }

  if (!Number.isSafeInteger(windowMs) || windowMs < 1) {
    throw new TypeError("windowMs must be a positive integer.");
  }

  return async function apiRateLimit(req, res, next) {
    try {
      // Authentication middleware must run before this middleware.
      const apiKeyId = req.apiKey?.id;

      if (!apiKeyId) {
        return res.status(401).json({
          success: false,
          error: {
            code: "API_KEY_REQUIRED",
            message: "Authenticate with an API key before making this request."
          }
        });
      }

      if (!redisClient.isReady) {
        return res.status(503).json({
          success: false,
          error: {
            code: "RATE_LIMITER_UNAVAILABLE",
            message: "Rate limiting is temporarily unavailable."
          }
        });
      }

      const now = Date.now();
      const windowNumber = Math.floor(now / windowMs);
      const windowEnd = (windowNumber + 1) * windowMs;
      const ttlMs = Math.max(1, windowEnd - now);

      // Each API key has its own counter for each time window.
      const redisKey =
        `keyflux:rate-limit:${apiKeyId}:${windowNumber}`;

      const result = await redisClient.eval(RATE_LIMIT_SCRIPT, {
        keys: [redisKey],
        arguments: [String(ttlMs)]
      });

      const requestCount = Number(result[0]);
      const remaining = Math.max(0, maxRequests - requestCount);
      const resetAt = Math.ceil(windowEnd / 1000);

      res.set("RateLimit-Limit", String(maxRequests));
      res.set("RateLimit-Remaining", String(remaining));
      res.set("RateLimit-Reset", String(resetAt));

      if (requestCount > maxRequests) {
        const retryAfter = Math.max(
          1,
          Math.ceil((windowEnd - Date.now()) / 1000)
        );

        res.set("Retry-After", String(retryAfter));

        return res.status(429).json({
          success: false,
          error: {
            code: "RATE_LIMIT_EXCEEDED",
            message: "Too many requests. Please try again later."
          },
          retryAfter
        });
      }

      return next();
    } catch (error) {
      console.error("API rate limiting failed:", error.message);

      // Fail closed if Redis cannot enforce the request limit.
      return res.status(503).json({
        success: false,
        error: {
          code: "RATE_LIMITER_UNAVAILABLE",
          message: "Rate limiting is temporarily unavailable."
        }
      });
    }
  };
}

export const apiRateLimit = createApiRateLimit();
