
import pool from "../config/database.js";

export async function logApiUsage({
  projectId,
  apiKeyId = null,
  httpMethod,
  requestPath,
  statusCode,
  responseTimeMs
}) {
  if (!projectId || !httpMethod || !requestPath || !Number.isInteger(statusCode)) {
    throw new TypeError("Required API usage log fields are missing or invalid.");
  }

  const safeResponseTimeMs = Number.isFinite(responseTimeMs)
    ? Math.max(0, Math.round(responseTimeMs))
    : 0;

  await pool.query(
    `INSERT INTO api_usage_logs (
       project_id,
       api_key_id,
       http_method,
       request_path,
       status_code,
       response_time_ms
     )
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      projectId,
      apiKeyId,
      httpMethod,
      requestPath,
      statusCode,
      safeResponseTimeMs
    ]
  );
}
