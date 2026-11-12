
import pool from "../config/database.js";
import { generateApiKey } from "../utils/apiKey.js";
import redisClient from "../config/redis.js";

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

function validateRateLimit(value, fieldName, defaultValue) {
  if (value === undefined || value === null || value === "") {
    return defaultValue;
  }

  const number = Number(value);

  if (!Number.isSafeInteger(number) || number < 1) {
    throw new TypeError(
      `${fieldName} must be a positive safe integer.`
    );
  }

  return number;
}

// Validate API key scopes.
function validateScopes(scopes = ["*"]) {
  if (!Array.isArray(scopes) || scopes.length === 0) {
    throw new TypeError("scopes must be a non-empty array.");
  }

  if (scopes.length > 50) {
    throw new TypeError("A maximum of 50 scopes is allowed.");
  }

  const validMethods = [
    "GET",
    "POST",
    "PUT",
    "PATCH",
    "DELETE",
    "HEAD",
    "OPTIONS"
  ];

  const cleanScopes = scopes.map((scope) => {
    if (typeof scope !== "string" || !scope.trim()) {
      throw new TypeError("Each scope must be a non-empty string.");
    }

    const cleanScope = scope.trim();

    if (cleanScope === "*") {
      return cleanScope;
    }

    const match = cleanScope.match(
      /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS):\/[A-Za-z0-9/_:-]*$/
    );

    if (!match || !validMethods.includes(match[1])) {
      throw new TypeError(
        `Invalid scope: ${cleanScope}. Use METHOD:/path or *.`
      );
    }

    return cleanScope;
  });

  if (
    cleanScopes.includes("*") &&
    cleanScopes.length !== 1
  ) {
    throw new TypeError(
      'The "*" scope cannot be combined with other scopes.'
    );
  }

  if (new Set(cleanScopes).size !== cleanScopes.length) {
    throw new TypeError("Duplicate scopes are not allowed.");
  }

  return cleanScopes;
}


// ============================================
// CREATE API KEY
// ============================================

export async function createApiKey({
  projectId,
  name,
  expiresAt = null,
  rateLimitMax = 100,
  rateLimitWindowMs = 60000,
  scopes = ["*"]
}) {
  const validProjectId = validateId(projectId, "projectId");
  const validName = validateName(name);
  const validExpiration = validateExpiration(expiresAt);

  const validRateLimitMax = validateRateLimit(
    rateLimitMax,
    "rateLimitMax",
    100
  );

  const validRateLimitWindowMs = validateRateLimit(
    rateLimitWindowMs,
    "rateLimitWindowMs",
    60000
  );

  const validScopes = validateScopes(scopes);

  const generated = generateApiKey();

  const result = await pool.query(
    `INSERT INTO api_keys
       (
         project_id,
         name,
         key_prefix,
         key_hash,
         expires_at,
         rate_limit_max,
         rate_limit_window_ms,
         scopes
       )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING
       id,
       project_id,
       name,
       key_prefix,
       expires_at,
       rate_limit_max,
       rate_limit_window_ms,
       scopes,
       created_at`,
    [
      validProjectId,
      validName,
      generated.keyPrefix,
      generated.keyHash,
      validExpiration,
      validRateLimitMax,
      validRateLimitWindowMs,
      validScopes
    ]
  );

  return {
    key: generated.fullKey,
    apiKey: result.rows[0]
  };
}


// ============================================
// LIST API KEYS
// ============================================

export async function listApiKeys({
  projectId,
  status = "all",
  expiringWithinDays = null
}) {
  const validProjectId = validateId(projectId, "projectId");

  const allowedStatuses = ["all", "active", "expired", "revoked"];

  if (!allowedStatuses.includes(status)) {
    const error = new TypeError(
      "status must be one of: all, active, expired, revoked."
    );

    error.code = "INVALID_API_KEY_STATUS";
    throw error;
  }

  let validExpiringDays = null;

  if (expiringWithinDays !== null && expiringWithinDays !== "") {
    validExpiringDays = Number(expiringWithinDays);

    if (
      !Number.isInteger(validExpiringDays) ||
      validExpiringDays < 1 ||
      validExpiringDays > 365
    ) {
      const error = new TypeError(
        "expiringWithinDays must be an integer between 1 and 365."
      );

      error.code = "INVALID_EXPIRATION_WINDOW";
      throw error;
    }
  }

  const result = await pool.query(
    `SELECT
       id,
       project_id,
       name,
       key_prefix,
       rate_limit_max,
       rate_limit_window_ms,
       scopes,
       last_used_at,
       expires_at,
       revoked_at,
       created_at
     FROM api_keys
     WHERE project_id = $1
       AND (
         $2 = 'all'
         OR (
           $2 = 'active'
           AND revoked_at IS NULL
           AND (expires_at IS NULL OR expires_at > NOW())
         )
         OR (
           $2 = 'expired'
           AND revoked_at IS NULL
           AND expires_at <= NOW()
         )
         OR (
           $2 = 'revoked'
           AND revoked_at IS NOT NULL
         )
       )
       AND (
         $3::integer IS NULL
         OR (
           revoked_at IS NULL
           AND expires_at > NOW()
           AND expires_at <= NOW() + ($3 * INTERVAL '1 day')
         )
       )
     ORDER BY created_at DESC`,
    [validProjectId, status, validExpiringDays]
  );

  return result.rows;
}


// ============================================
// GET API KEY USAGE INSIGHTS
// ============================================

export async function getApiKeyInsights({
  projectId,
  recentWithinDays = 7,
  expiringWithinDays = 7
}) {
  const validProjectId = validateId(projectId, "projectId");

  const validRecentDays = Number(recentWithinDays);
  const validExpiringDays = Number(expiringWithinDays);

  if (
    !Number.isInteger(validRecentDays) ||
    validRecentDays < 1 ||
    validRecentDays > 365
  ) {
    const error = new TypeError(
      "recentWithinDays must be an integer between 1 and 365."
    );

    error.code = "INVALID_RECENT_WINDOW";
    throw error;
  }

  if (
    !Number.isInteger(validExpiringDays) ||
    validExpiringDays < 1 ||
    validExpiringDays > 365
  ) {
    const error = new TypeError(
      "expiringWithinDays must be an integer between 1 and 365."
    );

    error.code = "INVALID_EXPIRATION_WINDOW";
    throw error;
  }

  const result = await pool.query(
    `WITH active_keys AS (
       SELECT
         id,
         name,
         key_prefix,
         last_used_at,
         expires_at,
         created_at
       FROM api_keys
       WHERE project_id = $1
         AND revoked_at IS NULL
         AND (expires_at IS NULL OR expires_at > NOW())
     )

     SELECT
       COUNT(*) FILTER (
         WHERE last_used_at IS NULL
       )::int AS unused_count,

       COUNT(*) FILTER (
         WHERE last_used_at >= NOW() - ($2 * INTERVAL '1 day')
       )::int AS recently_used_count,

       COUNT(*) FILTER (
         WHERE expires_at > NOW()
           AND expires_at <= NOW() + ($3 * INTERVAL '1 day')
       )::int AS expiring_soon_count,

       COALESCE(
         jsonb_agg(to_jsonb(k) ORDER BY k.created_at DESC)
         FILTER (WHERE k.last_used_at IS NULL),
         '[]'::jsonb
       ) AS unused_keys,

       COALESCE(
         jsonb_agg(to_jsonb(k) ORDER BY k.last_used_at DESC)
         FILTER (
           WHERE k.last_used_at >= NOW() - ($2 * INTERVAL '1 day')
         ),
         '[]'::jsonb
       ) AS recently_used_keys,

       COALESCE(
         jsonb_agg(to_jsonb(k) ORDER BY k.expires_at ASC)
         FILTER (
           WHERE k.expires_at > NOW()
             AND k.expires_at <= NOW() + ($3 * INTERVAL '1 day')
         ),
         '[]'::jsonb
       ) AS expiring_soon_keys

     FROM active_keys k`,
    [validProjectId, validRecentDays, validExpiringDays]
  );

  return result.rows[0];
}


// ============================================
// REVOKE API KEY
// ============================================

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


// ============================================
// GET API KEY USAGE
// ============================================

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

  if (summaryResult.rows.length === 0) {
    return null;
  }

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


// ============================================
// GET API KEY RATE LIMIT
// ============================================

export async function getApiKeyRateLimit({
  projectId,
  apiKeyId
}) {
  const validProjectId = validateId(projectId, "projectId");
  const validApiKeyId = validateId(apiKeyId, "apiKeyId");

  // Find the API key and verify project ownership.
  const result = await pool.query(
    `SELECT
       id,
       name,
       rate_limit_max,
       rate_limit_window_ms
     FROM api_keys
     WHERE id = $1
       AND project_id = $2`,
    [validApiKeyId, validProjectId]
  );

  const apiKey = result.rows[0];

  if (!apiKey) {
    return null;
  }

  if (!redisClient.isReady) {
    const error = new Error(
      "Redis is currently unavailable."
    );

    error.code = "RATE_LIMITER_UNAVAILABLE";
    throw error;
  }

  const now = Date.now();

  const limit = apiKey.rate_limit_max;
  const windowMs = apiKey.rate_limit_window_ms;

  // Calculate the same window used by the rate-limit middleware.
  const windowNumber = Math.floor(now / windowMs);
  const windowEnd = (windowNumber + 1) * windowMs;

  // Read the existing Redis counter.
  const redisKey =
    `keyflux:rate-limit:${apiKey.id}:${windowMs}:${windowNumber}`;

  const [storedCount, ttl] = await Promise.all([
    redisClient.get(redisKey),
    redisClient.pTTL(redisKey)
  ]);

  const requestsUsed = storedCount
    ? Number(storedCount)
    : 0;

  const requestsRemaining = Math.max(
    0,
    limit - requestsUsed
  );

  const usagePercentage = Math.min(
    100,
    Number(((requestsUsed / limit) * 100).toFixed(2))
  );

  return {
    apiKeyId: apiKey.id,
    name: apiKey.name,
    limit,
    requestsUsed,
    requestsRemaining,
    usagePercentage,
    windowMs,
    resetAt: new Date(windowEnd).toISOString(),
    resetInSeconds: Math.max(
      0,
      Math.ceil((windowEnd - Date.now()) / 1000)
    )
  };
}


// ============================================
// UPDATE API KEY RATE LIMIT
// ============================================

export async function updateApiKeyRateLimit({
  projectId,
  apiKeyId,
  rateLimitMax,
  rateLimitWindowMs
}) {
  if (rateLimitMax === undefined || rateLimitMax === null) {
    throw new TypeError("rateLimitMax is required.");
  }

  if (
    rateLimitWindowMs === undefined ||
    rateLimitWindowMs === null
  ) {
    throw new TypeError("rateLimitWindowMs is required.");
  }

  const validProjectId = validateId(projectId, "projectId");
  const validApiKeyId = validateId(apiKeyId, "apiKeyId");

  const validRateLimitMax = validateRateLimit(
    rateLimitMax,
    "rateLimitMax"
  );

  const validRateLimitWindowMs = validateRateLimit(
    rateLimitWindowMs,
    "rateLimitWindowMs"
  );

  const result = await pool.query(
    `UPDATE api_keys
     SET
       rate_limit_max = $1,
       rate_limit_window_ms = $2
     WHERE id = $3
       AND project_id = $4
       AND revoked_at IS NULL
     RETURNING
       id,
       project_id,
       name,
       key_prefix,
       rate_limit_max,
       rate_limit_window_ms,
       expires_at,
       last_used_at,
       revoked_at,
       created_at`,
    [
      validRateLimitMax,
      validRateLimitWindowMs,
      validApiKeyId,
      validProjectId
    ]
  );

  return result.rows[0] ?? null;
}

// ============================================
// UPDATE API KEY SCOPES
// ============================================

export async function updateApiKeyScopes({
  projectId,
  apiKeyId,
  scopes
}) {
  if (scopes === undefined || scopes === null) {
    throw new TypeError("scopes is required.");
  }

  const validProjectId = validateId(projectId, "projectId");
  const validApiKeyId = validateId(apiKeyId, "apiKeyId");
  const validScopes = validateScopes(scopes);

  const result = await pool.query(
    `UPDATE api_keys
     SET scopes = $1
     WHERE id = $2
       AND project_id = $3
       AND revoked_at IS NULL
     RETURNING
       id,
       project_id,
       name,
       key_prefix,
       scopes,
       rate_limit_max,
       rate_limit_window_ms,
       expires_at,
       last_used_at,
       revoked_at,
       created_at`,
    [
      validScopes,
      validApiKeyId,
      validProjectId
    ]
  );

  return result.rows[0] ?? null;
}


// ============================================
// ROTATE API KEY
// ============================================

export async function rotateApiKey({ projectId, apiKeyId }) {
  const validProjectId = validateId(projectId, "projectId");
  const validApiKeyId = validateId(apiKeyId, "apiKeyId");

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Lock the existing key to prevent simultaneous rotations.
    const oldKeyResult = await client.query(
      `SELECT
         id,
         project_id,
         name,
         expires_at,
         revoked_at,
         rate_limit_max,
         rate_limit_window_ms,
         scopes
       FROM api_keys
       WHERE id = $1
         AND project_id = $2
       FOR UPDATE`,
      [validApiKeyId, validProjectId]
    );

    const oldKey = oldKeyResult.rows[0];

    if (!oldKey || oldKey.revoked_at) {
      await client.query("ROLLBACK");
      return null;
    }

    if (
      oldKey.expires_at &&
      new Date(oldKey.expires_at).getTime() <= Date.now()
    ) {
      const error = new Error(
        "An expired API key cannot be rotated."
      );

      error.code = "API_KEY_EXPIRED";
      throw error;
    }

    const generated = generateApiKey();

    // Preserve expiration, rate limits, and scopes.
    const newKeyResult = await client.query(
      `INSERT INTO api_keys
         (
           project_id,
           name,
           key_prefix,
           key_hash,
           expires_at,
           rate_limit_max,
           rate_limit_window_ms,
           scopes
         )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING
         id,
         project_id,
         name,
         key_prefix,
         expires_at,
         rate_limit_max,
         rate_limit_window_ms,
         scopes,
         created_at`,
      [
        validProjectId,
        oldKey.name,
        generated.keyPrefix,
        generated.keyHash,
        oldKey.expires_at,
        oldKey.rate_limit_max,
        oldKey.rate_limit_window_ms,
        oldKey.scopes
      ]
    );

    const revokedKeyResult = await client.query(
      `UPDATE api_keys
       SET revoked_at = NOW()
       WHERE id = $1
         AND project_id = $2
         AND revoked_at IS NULL
       RETURNING id, project_id, revoked_at`,
      [validApiKeyId, validProjectId]
    );

    if (revokedKeyResult.rowCount !== 1) {
      throw new Error(
        "Failed to revoke the previous API key."
      );
    }

    await client.query("COMMIT");

    return {
      key: generated.fullKey,
      apiKey: newKeyResult.rows[0],
      revokedApiKey: revokedKeyResult.rows[0]
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
