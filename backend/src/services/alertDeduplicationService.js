
import redisClient from "../config/redis.js";

function getAlertRedisKey({
  apiKeyId,
  alertType,
  windowMs,
  windowNumber
}) {
  return `keyflux:alert:${apiKeyId}:${windowMs}:${alertType}:${windowNumber}`;
}

/**
 * Reserve an alert slot for this API key and rate-limit window.
 * Returns true only when this alert has not already been reserved.
 */
export async function shouldCreateRateLimitAlert({
  apiKeyId,
  alertType,
  windowMs,
  windowNumber,
  ttlMs
}) {
  if (!redisClient.isReady) {
    throw new Error("Redis is unavailable for alert deduplication.");
  }

  if (
    !Number.isSafeInteger(Number(apiKeyId)) ||
    apiKeyId < 1 ||
    !Number.isSafeInteger(windowMs) ||
    windowMs < 1 ||
    !Number.isSafeInteger(windowNumber) ||
    windowNumber < 0 ||
    !Number.isSafeInteger(ttlMs) ||
    ttlMs < 1
  ) {
    throw new TypeError("Invalid alert deduplication parameters.");
  }

  const redisKey = getAlertRedisKey({
    apiKeyId,
    alertType,
    windowMs,
    windowNumber
  });

  const result = await redisClient.set(redisKey, "1", {
    NX: true,
    PX: ttlMs
  });

  return result === "OK";
}

/**
 * Release a reservation if saving the alert to PostgreSQL fails.
 */
export async function releaseRateLimitAlertReservation({
  apiKeyId,
  alertType,
  windowMs,
  windowNumber
}) {
  if (!redisClient.isReady) {
    return;
  }

  const redisKey = getAlertRedisKey({
    apiKeyId,
    alertType,
    windowMs,
    windowNumber
  });

  await redisClient.del(redisKey);
}


