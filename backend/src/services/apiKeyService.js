
import pool from "../config/database.js";
import { generateApiKey } from "../utils/apiKey.js";

function validateId(value, fieldName) {
  const id = String(value ?? "");

  if (!/^[1-9]\d*$/.test(id)) {
    throw new TypeError(`${fieldName} must be a positive integer.`);
  }

  return id;
}

function validateName(name) {
  if (typeof name !== "string" || !name.trim()) {
    throw new TypeError("API key name is required.");
  }

  const cleanName = name.trim();

  if (cleanName.length > 100) {
    throw new TypeError("API key name cannot exceed 100 characters.");
  }

  return cleanName;
}

function validateExpiration(expiresAt) {
  if (expiresAt == null || expiresAt === "") {
    return null;
  }

  const date = new Date(expiresAt);

  if (Number.isNaN(date.getTime())) {
    throw new TypeError("expiresAt must be a valid date.");
  }

  if (date.getTime() <= Date.now()) {
    throw new TypeError("expiresAt must be in the future.");
  }

  return date.toISOString();
}

export async function createApiKey({
  projectId,
  name,
  expiresAt = null
}) {
  const validProjectId = validateId(projectId, "projectId");
  const validName = validateName(name);
  const validExpiration = validateExpiration(expiresAt);

  const generated = generateApiKey();

  const result = await pool.query(
    `INSERT INTO api_keys
       (project_id, name, key_prefix, key_hash, expires_at)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, project_id, name, key_prefix, expires_at, created_at`,
    [
      validProjectId,
      validName,
      generated.keyPrefix,
      generated.keyHash,
      validExpiration
    ]
  );

  return {
    key: generated.fullKey,
    apiKey: result.rows[0]
  };
}

export async function listApiKeys(projectId) {
  const validProjectId = validateId(projectId, "projectId");

  const result = await pool.query(
    `SELECT
       id,
       project_id,
       name,
       key_prefix,
       last_used_at,
       expires_at,
       revoked_at,
       created_at
     FROM api_keys
     WHERE project_id = $1
     ORDER BY created_at DESC`,
    [validProjectId]
  );

  return result.rows;
}

export async function revokeApiKey({ projectId, apiKeyId }) {
  const validProjectId = validateId(projectId, "projectId");
  const validApiKeyId = validateId(apiKeyId, "apiKeyId");

  const result = await pool.query(
    `UPDATE api_keys
     SET revoked_at = NOW()
     WHERE id = $1
       AND project_id = $2
       AND revoked_at IS NULL
     RETURNING id, project_id, revoked_at`,
    [validApiKeyId, validProjectId]
  );

  return result.rows[0] ?? null;
}

export async function getApiKeyUsage({
  projectId,
  apiKeyId,
  days = 7
}) {
  const validProjectId = validateId(projectId, "projectId");
  const validApiKeyId = validateId(apiKeyId, "apiKeyId");

  if (![7, 30, 90].includes(Number(days))) {
    throw new TypeError("days must be 7, 30, or 90.");
  }

  const validDays = Number(days);

  // Calculate statistics for this API key only.
  // The project condition prevents cross-project data access.
  const summaryResult = await pool.query(
    `SELECT
       COUNT(l.id)::int AS total_requests,

       COUNT(l.id) FILTER (
         WHERE l.status_code >= 200 AND l.status_code < 300
       )::int AS successful_requests,

       COUNT(l.id) FILTER (
         WHERE l.status_code >= 400 AND l.status_code < 500
       )::int AS client_errors,

       COUNT(l.id) FILTER (
         WHERE l.status_code >= 500 AND l.status_code < 600
       )::int AS server_errors,

       COUNT(l.id) FILTER (
         WHERE l.status_code >= 400
       )::int AS failed_requests,

       COALESCE(
         ROUND(AVG(l.response_time_ms)::numeric, 2),
         0
       ) AS average_response_time_ms

     FROM api_keys k

     LEFT JOIN api_usage_logs l
       ON l.api_key_id = k.id
       AND l.project_id = k.project_id
       AND l.created_at >= NOW() - ($3::int * INTERVAL '1 day')

     WHERE k.id = $1
       AND k.project_id = $2

     GROUP BY k.id`,
    [validApiKeyId, validProjectId, validDays]
  );

  // Return null if the key does not belong to this project.
  if (summaryResult.rows.length === 0) {
    return null;
  }

  // Calculate daily usage for the selected API key.
  const timelineResult = await pool.query(
    `SELECT
       TO_CHAR(
         DATE_TRUNC('day', created_at),
         'YYYY-MM-DD'
       ) AS date,

       COUNT(*)::int AS total_requests,

       COUNT(*) FILTER (
         WHERE status_code >= 200 AND status_code < 300
       )::int AS successful_requests,

       COUNT(*) FILTER (
         WHERE status_code >= 400 AND status_code < 500
       )::int AS client_errors,

       COUNT(*) FILTER (
         WHERE status_code >= 500 AND status_code < 600
       )::int AS server_errors

     FROM api_usage_logs

     WHERE api_key_id = $1
       AND project_id = $2
       AND created_at >= NOW() - ($3::int * INTERVAL '1 day')

     GROUP BY DATE_TRUNC('day', created_at)

     ORDER BY DATE_TRUNC('day', created_at) ASC`,
    [validApiKeyId, validProjectId, validDays]
  );

  const summary = summaryResult.rows[0];

  return {
    ...summary,
    average_response_time_ms: Number(
      summary.average_response_time_ms
    ),
    timeline: timelineResult.rows
  };
}
