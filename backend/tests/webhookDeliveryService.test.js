
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import request from "supertest";

import app from "../src/app.js";
import pool from "../src/config/database.js";

import {
    claimWebhookDeliveries,
    markWebhookDeliverySuccess,
    markWebhookDeliveryFailed
} from "../src/services/webhookDeliveryService.js";

describe("Webhook Delivery Queue Service", () => {
    const email = `webhook-queue-${randomUUID()}@example.com`;
    const password = "KeyFlux_Webhook_Queue_Test_2026!";

    let projectId;

    async function createDelivery() {
        const webhookResult = await pool.query(
            `
            INSERT INTO webhooks (
                project_id,
                name,
                url,
                secret_encrypted,
                events
            )
            VALUES ($1, $2, $3, $4, $5)
            RETURNING id
            `,
            [
                projectId,
                `Queue Test ${randomUUID()}`,
                "https://example.com/webhook",
                "test-encrypted-secret",
                ["RATE_LIMIT_WARNING"]
            ]
        );

        const alertResult = await pool.query(
            `
            INSERT INTO api_alerts (
                project_id,
                api_key_id,
                alert_type,
                usage_count,
                rate_limit,
                window_ms
            )
            VALUES ($1, NULL, $2, $3, $4, $5)
            RETURNING id
            `,
            [
                projectId,
                "RATE_LIMIT_WARNING",
                80,
                100,
                60000
            ]
        );

        const deliveryResult = await pool.query(
            `
            INSERT INTO webhook_deliveries (
                webhook_id,
                alert_id
            )
            VALUES ($1, $2)
            RETURNING id
            `,
            [
                webhookResult.rows[0].id,
                alertResult.rows[0].id
            ]
        );

        return deliveryResult.rows[0].id;
    }

    before(async () => {
        const registerResponse = await request(app)
            .post("/api/v1/auth/register")
            .send({
                name: "Webhook Queue Test User",
                email,
                password
            });

        assert.equal(registerResponse.status, 201);

        const loginResponse = await request(app)
            .post("/api/v1/auth/login")
            .send({ email, password });

        assert.equal(loginResponse.status, 200);

        const token = loginResponse.body.data.token;

        const projectResponse = await request(app)
            .post("/api/v1/projects")
            .set("Authorization", `Bearer ${token}`)
            .send({
                name: "Webhook Queue Test Project",
                description: "Temporary project for queue tests."
            });

        assert.equal(projectResponse.status, 201);

        projectId = projectResponse.body.data.project.id;
    });

    after(async () => {
        await pool.query(
            "DELETE FROM users WHERE email = $1",
            [email]
        );
    });

    it("should claim pending deliveries and increment attempts", async () => {
        const deliveryId = await createDelivery();

        const deliveries = await claimWebhookDeliveries(
            "queue-test-worker-1",
            10
        );

        const claimed = deliveries.find(
            delivery => String(delivery.delivery_id) === String(deliveryId)
        );

        assert.ok(claimed);
        assert.equal(claimed.attempts, 1);
        assert.equal(claimed.is_active, true);
        assert.equal(claimed.alert_type, "RATE_LIMIT_WARNING");

        const result = await pool.query(
            `
            SELECT status, attempts, locked_by
            FROM webhook_deliveries
            WHERE id = $1
            `,
            [deliveryId]
        );

        assert.equal(result.rows[0].status, "PENDING");
        assert.equal(result.rows[0].attempts, 1);
        assert.equal(result.rows[0].locked_by, "queue-test-worker-1");
    });

    it("should prevent another worker from claiming an active lease", async () => {
        const deliveryId = await createDelivery();

        const firstWorker = await claimWebhookDeliveries(
            "queue-owner-1",
            10
        );

        assert.ok(
            firstWorker.some(
                delivery => String(delivery.delivery_id) === String(deliveryId)
            )
        );

        const secondWorker = await claimWebhookDeliveries(
            "queue-owner-2",
            10
        );

        assert.equal(
            secondWorker.some(
                delivery => String(delivery.delivery_id) === String(deliveryId)
            ),
            false
        );
    });

    it("should reclaim deliveries with expired leases", async () => {
        const deliveryId = await createDelivery();

        await claimWebhookDeliveries("expired-worker", 10);

        await pool.query(
            `
            UPDATE webhook_deliveries
            SET locked_at = NOW() - INTERVAL '61 seconds'
            WHERE id = $1
            `,
            [deliveryId]
        );

        const deliveries = await claimWebhookDeliveries(
            "recovery-worker",
            10
        );

        const reclaimed = deliveries.find(
            delivery => String(delivery.delivery_id) === String(deliveryId)
        );

        assert.ok(reclaimed);
        assert.equal(reclaimed.attempts, 2);

        const result = await pool.query(
            `
            SELECT locked_by
            FROM webhook_deliveries
            WHERE id = $1
            `,
            [deliveryId]
        );

        assert.equal(result.rows[0].locked_by, "recovery-worker");
    });

    it("should mark successful deliveries and release their leases", async () => {
        const deliveryId = await createDelivery();

        await claimWebhookDeliveries("success-worker", 10);

        const updated = await markWebhookDeliverySuccess({
            deliveryId,
            workerId: "success-worker",
            responseStatus: 200,
            responseBody: "Accepted"
        });

        assert.equal(updated, true);

        const result = await pool.query(
            `
            SELECT
                status,
                response_status,
                response_body,
                delivered_at,
                next_retry_at,
                locked_at,
                locked_by
            FROM webhook_deliveries
            WHERE id = $1
            `,
            [deliveryId]
        );

        const delivery = result.rows[0];

        assert.equal(delivery.status, "SUCCESS");
        assert.equal(delivery.response_status, 200);
        assert.equal(delivery.response_body, "Accepted");
        assert.ok(delivery.delivered_at);
        assert.equal(delivery.next_retry_at, null);
        assert.equal(delivery.locked_at, null);
        assert.equal(delivery.locked_by, null);
    });

    it("should schedule exponential retries after failures", async () => {
        const deliveryId = await createDelivery();

        await claimWebhookDeliveries("retry-worker", 10);

        const firstFailure = await markWebhookDeliveryFailed({
            deliveryId,
            workerId: "retry-worker",
            responseStatus: 500,
            responseBody: "Internal Server Error"
        });

        assert.ok(firstFailure);
        assert.equal(firstFailure.attempts, 1);
        assert.ok(firstFailure.next_retry_at);

        const firstRetry = await pool.query(
            `
            SELECT
                EXTRACT(EPOCH FROM (next_retry_at - NOW())) AS retry_seconds
            FROM webhook_deliveries
            WHERE id = $1
            `,
            [deliveryId]
        );

        assert.ok(
            Number(firstRetry.rows[0].retry_seconds) > 50
        );

        // Make the delivery eligible for its next attempt.
        await pool.query(
            `
            UPDATE webhook_deliveries
            SET next_retry_at = NOW() - INTERVAL '1 second'
            WHERE id = $1
            `,
            [deliveryId]
        );

        await claimWebhookDeliveries("retry-worker", 10);

        const secondFailure = await markWebhookDeliveryFailed({
            deliveryId,
            workerId: "retry-worker",
            responseStatus: 500,
            responseBody: "Still failing"
        });

        assert.ok(secondFailure);
        assert.equal(secondFailure.attempts, 2);

        const secondRetry = await pool.query(
            `
            SELECT
                EXTRACT(EPOCH FROM (next_retry_at - NOW())) AS retry_seconds
            FROM webhook_deliveries
            WHERE id = $1
            `,
            [deliveryId]
        );

        assert.ok(
            Number(secondRetry.rows[0].retry_seconds) > 110
        );
    });

    it("should not allow a different worker to update a claimed delivery", async () => {
        const deliveryId = await createDelivery();

        await claimWebhookDeliveries("actual-owner", 10);

        const updated = await markWebhookDeliverySuccess({
            deliveryId,
            workerId: "different-worker",
            responseStatus: 200,
            responseBody: "Should not be accepted"
        });

        assert.equal(updated, false);

        const result = await pool.query(
            `
            SELECT status, locked_by
            FROM webhook_deliveries
            WHERE id = $1
            `,
            [deliveryId]
        );

        assert.equal(result.rows[0].status, "PENDING");
        assert.equal(result.rows[0].locked_by, "actual-owner");
    });

    it("should reject invalid worker IDs and batch sizes", async () => {
        await assert.rejects(
            () => claimWebhookDeliveries("", 10),
            /valid worker ID/
        );

        await assert.rejects(
            () => claimWebhookDeliveries("test-worker", 0),
            /Batch size/
        );

        await assert.rejects(
            () => claimWebhookDeliveries("test-worker", 101),
            /Batch size/
        );
    });
});
