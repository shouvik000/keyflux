
import pool from "../config/database.js";

const MAX_ATTEMPTS = 5;
const LOCK_TIMEOUT_SECONDS = 60;

/**
 * Atomically claim webhook deliveries that are ready to be processed.
 *
 * FOR UPDATE SKIP LOCKED allows multiple workers to process the queue
 * without claiming the same delivery at the same time.
 *
 * Expired locks are reclaimed if a worker crashes.
 */
export async function claimWebhookDeliveries(workerId, batchSize = 10) {
    if (!workerId || typeof workerId !== "string") {
        throw new Error("A valid worker ID is required.");
    }

    if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 100) {
        throw new Error("Batch size must be between 1 and 100.");
    }

    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        const result = await client.query(
            `
            WITH available_deliveries AS (
                SELECT id
                FROM webhook_deliveries
                WHERE status IN ('PENDING', 'FAILED')
                    AND attempts < $1
                    AND (
                        next_retry_at IS NULL
                        OR next_retry_at <= NOW()
                    )
                    AND (
                        locked_at IS NULL
                        OR locked_at < NOW() - ($2 * INTERVAL '1 second')
                    )
                ORDER BY created_at ASC, id ASC
                LIMIT $3
                FOR UPDATE SKIP LOCKED
            )
            UPDATE webhook_deliveries AS delivery
            SET
                locked_at = NOW(),
                locked_by = $4,
                attempts = delivery.attempts + 1,
                updated_at = NOW()
            FROM available_deliveries
            WHERE delivery.id = available_deliveries.id
            RETURNING delivery.*
            `,
            [MAX_ATTEMPTS, LOCK_TIMEOUT_SECONDS, batchSize, workerId]
        );

        if (result.rows.length === 0) {
            await client.query("COMMIT");
            return [];
        }

        const deliveryIds = result.rows.map((delivery) => delivery.id);

        const detailsResult = await client.query(
            `
            SELECT
                delivery.id AS delivery_id,
                delivery.webhook_id,
                delivery.alert_id,
                delivery.attempts,
                webhook.url,
                webhook.secret_encrypted,
                webhook.is_active,
                alert.project_id,
                alert.api_key_id,
                alert.alert_type,
                alert.usage_count,
                alert.rate_limit,
                alert.window_ms,
                alert.created_at AS alert_created_at
            FROM webhook_deliveries AS delivery
            INNER JOIN webhooks AS webhook
                ON webhook.id = delivery.webhook_id
            INNER JOIN api_alerts AS alert
                ON alert.id = delivery.alert_id
            WHERE delivery.id = ANY($1::bigint[])
                AND delivery.locked_by = $2
            ORDER BY delivery.created_at ASC, delivery.id ASC
            `,
            [deliveryIds, workerId]
        );

        await client.query("COMMIT");

        return detailsResult.rows;
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
}

/**
 * Mark a delivery as successfully delivered.
 */
export async function markWebhookDeliverySuccess({
    deliveryId,
    workerId,
    responseStatus,
    responseBody
}) {
    const result = await pool.query(
        `
        UPDATE webhook_deliveries
        SET
            status = 'SUCCESS',
            response_status = $1,
            response_body = $2,
            delivered_at = NOW(),
            next_retry_at = NULL,
            locked_at = NULL,
            locked_by = NULL,
            updated_at = NOW()
        WHERE id = $3
            AND locked_by = $4
        RETURNING id
        `,
        [
            responseStatus,
            String(responseBody ?? "").slice(0, 16000),
            deliveryId,
            workerId
        ]
    );

    return result.rowCount === 1;
}

/**
 * Mark a delivery as failed and schedule its next retry.
 *
 * Retry delays: 1, 2, 4, and 8 minutes.
 * No retry is scheduled after the fifth attempt.
 */
export async function markWebhookDeliveryFailed({
    deliveryId,
    workerId,
    responseStatus = null,
    responseBody = "Webhook delivery failed."
}) {
    const result = await pool.query(
        `
        UPDATE webhook_deliveries
        SET
            status = 'FAILED',
            response_status = $1,
            response_body = $2,
            next_retry_at = CASE
                WHEN attempts < $3
                THEN NOW() + (
                    LEAST(
                        60 * POWER(2, attempts - 1),
                        3600
                    ) * INTERVAL '1 second'
                )
                ELSE NULL
            END,
            locked_at = NULL,
            locked_by = NULL,
            updated_at = NOW()
        WHERE id = $4
            AND locked_by = $5
        RETURNING id, attempts, next_retry_at
        `,
        [
            responseStatus,
            String(responseBody ?? "").slice(0, 16000),
            MAX_ATTEMPTS,
            deliveryId,
            workerId
        ]
    );

    return result.rows[0] ?? null;
}

export { MAX_ATTEMPTS, LOCK_TIMEOUT_SECONDS };
