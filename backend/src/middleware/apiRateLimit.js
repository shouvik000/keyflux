
import redisClient from "../config/redis.js";

import { createRateLimitAlert } from "../services/alertService.js";

import {
  shouldCreateRateLimitAlert,
  releaseRateLimitAlertReservation
} from "../services/alertDeduplicationService.js";

const DEFAULT_MAX_REQUESTS = 100;
const DEFAULT_WINDOW_MS = 60_000;

const RATE_LIMIT_SCRIPT = `
  local count = redis.call("INCR", KEYS[1])

  if count == 1 then
    redis.call("PEXPIRE", KEYS[1], ARGV[1])
  end

  local ttl = redis.call("PTTL", KEYS[1])

  return { count, ttl }
`;

async function recordRateLimitAlert({
  req,
  alertType,
  requestCount,
  keyMaxRequests,
  keyWindowMs,
  windowNumber,
  ttlMs
}) {
  const apiKeyId = req.apiKey.id;

  const reservation = {
    apiKeyId,
    alertType,
    windowMs: keyWindowMs,
    windowNumber
  };

  let reserved = false;

  try {
    reserved = await shouldCreateRateLimitAlert({
      ...reservation,
      ttlMs
    });

    if (!reserved) {
      return;
    }

    await createRateLimitAlert({
      projectId: req.apiKey.projectId,
      apiKeyId,
      alertType,
      usageCount: requestCount,
      rateLimit: keyMaxRequests,
      windowMs: keyWindowMs
    });
  } catch (error) {
    if (reserved) {
      try {
        await releaseRateLimitAlertReservation(reservation);
      } catch (releaseError) {
        console.error(
          "Failed to release alert reservation:",
          releaseError.message
        );
      }
    }

    console.error("Failed to record rate-limit alert:", error.message);
  }
}

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

      const keyMaxRequests = req.apiKey.rateLimitMax ?? maxRequests;
      const keyWindowMs = req.apiKey.rateLimitWindowMs ?? windowMs;

      if (
        !Number.isSafeInteger(keyMaxRequests) ||
        keyMaxRequests < 1 ||
        !Number.isSafeInteger(keyWindowMs) ||
        keyWindowMs < 1
      ) {
        throw new Error("Invalid API key rate-limit configuration.");
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
      const windowNumber = Math.floor(now / keyWindowMs);
      const windowEnd = (windowNumber + 1) * keyWindowMs;
      const ttlMs = Math.max(1, windowEnd - now);

      const redisKey =
        `keyflux:rate-limit:${apiKeyId}:${keyWindowMs}:${windowNumber}`;

      const result = await redisClient.eval(RATE_LIMIT_SCRIPT, {
        keys: [redisKey],
        arguments: [String(ttlMs)]
      });

      const requestCount = Number(result[0]);
      const remaining = Math.max(0, keyMaxRequests - requestCount);
      const resetAt = Math.ceil(windowEnd / 1000);

      res.set("RateLimit-Limit", String(keyMaxRequests));
      res.set("RateLimit-Remaining", String(remaining));
      res.set("RateLimit-Reset", String(resetAt));

      // Record one warning when usage reaches 80%.
      const warningThreshold = Math.ceil(keyMaxRequests * 0.8);

      if (
        requestCount >= warningThreshold &&
        requestCount <= keyMaxRequests
      ) {
        await recordRateLimitAlert({
          req,
          alertType: "RATE_LIMIT_WARNING",
          requestCount,
          keyMaxRequests,
          keyWindowMs,
          windowNumber,
          ttlMs
        });
      }

      if (requestCount > keyMaxRequests) {
        // Record one exceeded alert per API key and window.
        await recordRateLimitAlert({
          req,
          alertType: "RATE_LIMIT_EXCEEDED",
          requestCount,
          keyMaxRequests,
          keyWindowMs,
          windowNumber,
          ttlMs
        });

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
