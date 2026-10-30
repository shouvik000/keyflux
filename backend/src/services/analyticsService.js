
import pool from "../config/database.js";

export async function getAnalyticsOverview(projectId, days) {
  const result = await pool.query(
    `SELECT
       COUNT(*)::int AS total_requests,

       COUNT(*) FILTER (
         WHERE status_code >= 200 AND status_code < 300
       )::int AS successful_requests,

       COUNT(*) FILTER (
         WHERE status_code >= 400 AND status_code < 500
       )::int AS client_errors,

       COUNT(*) FILTER (
         WHERE status_code >= 500 AND status_code < 600
       )::int AS server_errors,

       COUNT(*) FILTER (
         WHERE status_code >= 400
       )::int AS failed_requests,

       COALESCE(
         ROUND(AVG(response_time_ms)::numeric, 2),
         0
       ) AS average_response_time_ms

     FROM api_usage_logs
     WHERE project_id = $1
       AND created_at >= NOW() - ($2::int * INTERVAL '1 day')`,
    [projectId, days]
  );

  return result.rows[0];
}

export async function getAnalyticsEndpoints(projectId, days) {
  const result = await pool.query(
    `SELECT
       request_path,
       http_method,

       COUNT(*)::int AS total_requests,

       COUNT(*) FILTER (
         WHERE status_code >= 200 AND status_code < 300
       )::int AS successful_requests,

       COUNT(*) FILTER (
         WHERE status_code >= 400 AND status_code < 500
       )::int AS client_errors,

       COUNT(*) FILTER (
         WHERE status_code >= 500 AND status_code < 600
       )::int AS server_errors,

       COUNT(*) FILTER (
         WHERE status_code >= 400
       )::int AS failed_requests,

       COALESCE(
         ROUND(AVG(response_time_ms)::numeric, 2),
         0
       ) AS average_response_time_ms

     FROM api_usage_logs
     WHERE project_id = $1
       AND created_at >= NOW() - ($2::int * INTERVAL '1 day')

     GROUP BY request_path, http_method
     ORDER BY total_requests DESC, request_path ASC
     LIMIT 20`,
    [projectId, days]
  );

  return result.rows;
}

export async function getAnalyticsTimeline(projectId, days) {
  const result = await pool.query(
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
       )::int AS server_errors,

       COUNT(*) FILTER (
         WHERE status_code >= 400
       )::int AS failed_requests

     FROM api_usage_logs
     WHERE project_id = $1
       AND created_at >= NOW() - ($2::int * INTERVAL '1 day')

     GROUP BY DATE_TRUNC('day', created_at)
     ORDER BY DATE_TRUNC('day', created_at) ASC`,
    [projectId, days]
  );

  return result.rows;
}



export async function getAnalyticsLogs(
  projectId,
  { days, page, limit, method, statusCode }
) {
  const offset = (page - 1) * limit;

  const filters = [projectId, days, method, statusCode];

  const whereClause = `
    WHERE project_id = $1
      AND created_at >= NOW() - ($2::int * INTERVAL '1 day')
      AND ($3::text IS NULL OR http_method = $3)
      AND ($4::int IS NULL OR status_code = $4)
  `;

  const countResult = await pool.query(
    `SELECT COUNT(*)::int AS total
     FROM api_usage_logs
     ${whereClause}`,
    filters
  );

  const logsResult = await pool.query(
    `SELECT
       request_path,
       http_method,
       status_code,
       response_time_ms,
       created_at
     FROM api_usage_logs
     ${whereClause}
     ORDER BY created_at DESC
     LIMIT $5 OFFSET $6`,
    [...filters, limit, offset]
  );

  const total = countResult.rows[0].total;

  return {
    logs: logsResult.rows,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      hasNextPage: page * limit < total,
      hasPreviousPage: page > 1
    }
  };
}
