
import pool from "../config/database.js";

const ALLOWED_ALERT_TYPES = [
  "RATE_LIMIT_WARNING",
  "RATE_LIMIT_EXCEEDED"
];

export async function createRateLimitAlert({
  projectId,
  apiKeyId,
  alertType,
  usageCount,
  rateLimit,
  windowMs
}) {
  if (!ALLOWED_ALERT_TYPES.includes(alertType)) {
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

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // 1. Create the alert.
    const result = await client.query(
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

    const alert = result.rows[0];

    // 2. Find active webhooks subscribed to this alert.
    const webhookResult = await client.query(
      `SELECT id
       FROM webhooks
       WHERE project_id = $1
         AND is_active = TRUE
         AND $2 = ANY(events)`,
      [Number(projectId), alertType]
    );

    // 3. Queue one delivery for each matching webhook.
    if (webhookResult.rows.length > 0) {
      const values = [];
      const placeholders = [];

      for (const webhook of webhookResult.rows) {
        const offset = values.length;

        values.push(webhook.id, alert.id);

        placeholders.push(
          `($${offset + 1}, $${offset + 2})`
        );
      }

      await client.query(
        `INSERT INTO webhook_deliveries (
           webhook_id,
           alert_id
         )
         VALUES ${placeholders.join(", ")}
         ON CONFLICT (webhook_id, alert_id) DO NOTHING`,
        values
      );
    }

    // 4. Save the alert and queue records together.
    await client.query("COMMIT");

    return alert;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      console.error(
        "Failed to roll back alert transaction:",
        rollbackError.message
      );
    }

    throw error;
  } finally {
    client.release();
  }
}

function validateProjectId(projectId) {
  if (
    !Number.isSafeInteger(Number(projectId)) ||
    Number(projectId) < 1
  ) {
    throw new TypeError("Invalid project ID.");
  }

  return Number(projectId);
}

function validateAlertFilters({ page, limit, alertType }) {
  if (!Number.isSafeInteger(page) || page < 1) {
    throw new TypeError("Page must be a positive integer.");
  }

  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new TypeError("Limit must be between 1 and 100.");
  }

  if (
    alertType !== null &&
    !ALLOWED_ALERT_TYPES.includes(alertType)
  ) {
    throw new TypeError("Invalid alert type.");
  }
}

export async function getProjectAlerts(
  projectId,
  {
    page = 1,
    limit = 10,
    alertType = null
  } = {}
) {
  const validProjectId = validateProjectId(projectId);

  validateAlertFilters({ page, limit, alertType });

  const offset = (page - 1) * limit;

  const values = [validProjectId];
  let filter = "";

  if (alertType !== null) {
    values.push(alertType);
    filter = `AND alert_type = $${values.length}`;
  }

  const countResult = await pool.query(
    `SELECT COUNT(*)::int AS total
     FROM api_alerts
     WHERE project_id = $1
     ${filter}`,
    values
  );

  const total = countResult.rows[0].total;

  values.push(limit);
  values.push(offset);

  const alertsResult = await pool.query(
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
     ${filter}
     ORDER BY created_at DESC, id DESC
     LIMIT $${values.length - 1}
     OFFSET $${values.length}`,
    values
  );

  const totalPages = Math.ceil(total / limit);

  return {
    alerts: alertsResult.rows,
    pagination: {
      total,
      page,
      limit,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1
    }
  };
}

export async function getProjectAlertById(projectId, alertId) {
  const validProjectId = validateProjectId(projectId);

  if (
    !Number.isSafeInteger(Number(alertId)) ||
    Number(alertId) < 1
  ) {
    throw new TypeError("Invalid alert ID.");
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
       AND id = $2
     LIMIT 1`,
    [validProjectId, Number(alertId)]
  );

  return result.rows[0] ?? null;
}
