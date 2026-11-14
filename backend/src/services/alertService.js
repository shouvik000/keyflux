
import pool from "../config/database.js";

export async function createRateLimitAlert({
  projectId,
  apiKeyId,
  alertType,
  usageCount,
  rateLimit,
  windowMs
}) {
  const allowedAlertTypes = [
    "RATE_LIMIT_WARNING",
    "RATE_LIMIT_EXCEEDED"
  ];

  if (!allowedAlertTypes.includes(alertType)) {
    throw new TypeError("Invalid rate-limit alert type.");
  }

  if (
    !Number.isSafeInteger(Number(projectId)) ||
    Number(projectId) < 1 ||
    !Number.isSafeInteger(Number(apiKeyId)) ||
    Number(apiKeyId) < 1
  ) {
    throw new TypeError("Invalid project or API key ID.");
  }

  if (
    !Number.isSafeInteger(Number(usageCount)) ||
    Number(usageCount) < 0 ||
    !Number.isSafeInteger(Number(rateLimit)) ||
    Number(rateLimit) < 1 ||
    !Number.isSafeInteger(Number(windowMs)) ||
    Number(windowMs) < 1
  ) {
    throw new TypeError("Invalid rate-limit alert values.");
  }

  const result = await pool.query(
    `INSERT INTO api_alerts (
       project_id,
       api_key_id,
       alert_type,
       usage_count,
       rate_limit,
       window_ms
     )
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING
       id,
       project_id,
       api_key_id,
       alert_type,
       usage_count,
       rate_limit,
       window_ms,
       created_at`,
    [
      Number(projectId),
      Number(apiKeyId),
      alertType,
      Number(usageCount),
      Number(rateLimit),
      Number(windowMs)
    ]
  );

  return result.rows[0];
}

export async function getProjectAlerts(projectId, limit = 50) {
  if (
    !Number.isSafeInteger(Number(projectId)) ||
    Number(projectId) < 1
  ) {
    throw new TypeError("Invalid project ID.");
  }

  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new TypeError("Alert limit must be between 1 and 100.");
  }

  const result = await pool.query(
    `SELECT
       id,
       project_id,
       api_key_id,
       alert_type,
       usage_count,
       rate_limit,
       window_ms,
       created_at
     FROM api_alerts
     WHERE project_id = $1
     ORDER BY created_at DESC, id DESC
     LIMIT $2`,
    [Number(projectId), limit]
  );

  return result.rows;
}
