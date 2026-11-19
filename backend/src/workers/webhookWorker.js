
import "../config/env.js";

import { randomUUID } from "node:crypto";

import pool from "../config/database.js";

import {
    claimWebhookDeliveries,
    markWebhookDeliverySuccess,
    markWebhookDeliveryFailed
} from "../services/webhookDeliveryService.js";

import {
    decryptWebhookSecret,
    signWebhookPayload
} from "../services/webhookCrypto.js";

import {
    sendWebhookRequest
} from "../services/webhookHttpClient.js";

const WORKER_ID = `webhook-worker-${randomUUID()}`;
const BATCH_SIZE = 10;
const POLL_INTERVAL_MS = 1000;

let isShuttingDown = false;

function sleep(milliseconds) {
    return new Promise((resolve) => {
        setTimeout(resolve, milliseconds);
    });
}

/**
 * Mark a delivery as permanently failed.
 *
 * Used when a webhook has been deactivated after its delivery
 * was added to the queue. Such deliveries should not be retried.
 */
async function markWebhookDeliveryInactive(deliveryId) {
    await pool.query(
        `
        UPDATE webhook_deliveries
        SET
            status = 'FAILED',
            attempts = 5,
            response_status = NULL,
            response_body = 'Webhook is inactive.',
            next_retry_at = NULL,
            locked_at = NULL,
            locked_by = NULL,
            updated_at = NOW()
        WHERE id = $1
            AND locked_by = $2
        `,
        [deliveryId, WORKER_ID]
    );
}

/**
 * Process one claimed webhook delivery.
 */
async function processDelivery(delivery) {
    const {
        delivery_id: deliveryId,
        alert_id: alertId,
        url,
        secret_encrypted: encryptedSecret,
        is_active: isActive
    } = delivery;

    try {
        if (!isActive) {
            await markWebhookDeliveryInactive(deliveryId);

            console.log(
                `[${WORKER_ID}] Delivery ${deliveryId} skipped: webhook inactive.`
            );

            return;
        }

        // Decrypt the webhook's signing secret.
        const secret = decryptWebhookSecret(encryptedSecret);

        // Construct the event payload.
        const payloadObject = {
            id: alertId,
            event: delivery.alert_type,
            created_at: delivery.alert_created_at,
            data: {
                project_id: delivery.project_id,
                api_key_id: delivery.api_key_id,
                usage_count: delivery.usage_count,
                rate_limit: delivery.rate_limit,
                window_ms: delivery.window_ms
            }
        };

        // Serialize exactly once so signing and sending use identical bytes.
        const payload = JSON.stringify(payloadObject);

        const signature = signWebhookPayload(secret, payload);

        // Send using the secure HTTP client.
        const response = await sendWebhookRequest({
            url,
            payload,
            signature
        });

        const isSuccessful =
            response.statusCode >= 200 &&
            response.statusCode < 300;

        if (isSuccessful) {
            const updated = await markWebhookDeliverySuccess({
                deliveryId,
                workerId: WORKER_ID,
                responseStatus: response.statusCode,
                responseBody: response.body
            });

            if (updated) {
                console.log(
                    `[${WORKER_ID}] Delivery ${deliveryId} succeeded (${response.statusCode}).`
                );
            }

            return;
        }

        const failed = await markWebhookDeliveryFailed({
            deliveryId,
            workerId: WORKER_ID,
            responseStatus: response.statusCode,
            responseBody: response.body || `HTTP ${response.statusCode}`
        });

        if (failed) {
            console.error(
                `[${WORKER_ID}] Delivery ${deliveryId} failed (${response.statusCode}). Attempt ${failed.attempts}/5.`
            );
        }
    } catch (error) {
        const failed = await markWebhookDeliveryFailed({
            deliveryId,
            workerId: WORKER_ID,
            responseStatus: null,
            responseBody: error.message || "Webhook delivery request failed."
        });

        if (failed) {
            console.error(
                `[${WORKER_ID}] Delivery ${deliveryId} failed. Attempt ${failed.attempts}/5: ${error.message}`
            );
        }
    }
}

/**
 * Claim and process one batch of deliveries.
 */
async function processBatch() {
    const deliveries = await claimWebhookDeliveries(
        WORKER_ID,
        BATCH_SIZE
    );

    await Promise.all(
        deliveries.map((delivery) => processDelivery(delivery))
    );

    return deliveries.length;
}
/**
 * Main polling loop.
 */
async function startWorker() {
    console.log(`[${WORKER_ID}] Webhook delivery worker started.`);

    while (!isShuttingDown) {
        try {
            const processedCount = await processBatch();

            if (processedCount === 0) {
                await sleep(POLL_INTERVAL_MS);
            }
        } catch (error) {
            console.error(
                `[${WORKER_ID}] Worker error: ${error.message}`
            );

            await sleep(POLL_INTERVAL_MS);
        }
    }

    console.log(`[${WORKER_ID}] Worker shutting down.`);

    await pool.end();
}

function shutdown(signal) {
    if (isShuttingDown) {
        return;
    }

    console.log(`[${WORKER_ID}] Received ${signal}.`);

    isShuttingDown = true;
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

startWorker().catch(async (error) => {
    console.error(`[${WORKER_ID}] Fatal error:`, error.message);

    await pool.end();

    process.exitCode = 1;
});
