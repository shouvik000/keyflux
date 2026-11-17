
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import request from "supertest";

import app from "../src/app.js";
import pool from "../src/config/database.js";
import { createApiKey } from "../src/services/apiKeyService.js";
import { createWebhook } from "../src/services/webhookService.js";
import redisClient, { connectRedis } from "../src/config/redis.js";

describe("API Usage Alerts", () => {
    const email = `alert-test-${randomUUID()}@example.com`;
    const password = "KeyFlux_Alert_Test_2026!";

    const rateLimitMax = 5;
    const rateLimitWindowMs = 60000;

    let projectId;
    let apiKey;
    let apiKeyId;
    let managementApiKey;
    let rateLimitRedisKey;
    let windowNumber;

    before(async () => {
        await connectRedis();

        const registerResponse = await request(app)
            .post("/api/v1/auth/register")
            .send({
                name: "Alert Test User",
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
                name: "Alert Test Project",
                description: "Temporary project for alert tests."
            });

        assert.equal(projectResponse.status, 201);

        projectId = projectResponse.body.data.project.id;

        const created = await createApiKey({
            projectId,
            name: "Alert Integration Test Key",
            rateLimitMax,
            rateLimitWindowMs
        });

        apiKey = created.key;
        apiKeyId = created.apiKey.id;

        const managementKey = await createApiKey({
            projectId,
            name: "Alert Management Test Key",
            rateLimitMax: 100,
            rateLimitWindowMs
        });

        managementApiKey = managementKey.key;

        await createWebhook({
            projectId,
            name: "Warning Subscriber",
            url: "https://example.com/webhooks/warning",
            events: ["RATE_LIMIT_WARNING"]
        });

        await createWebhook({
            projectId,
            name: "Exceeded Subscriber",
            url: "https://example.com/webhooks/exceeded",
            events: ["RATE_LIMIT_EXCEEDED"]
        });

        windowNumber = Math.floor(Date.now() / rateLimitWindowMs);

        const windowEnd = (windowNumber + 1) * rateLimitWindowMs;

        rateLimitRedisKey =
            `keyflux:rate-limit:${apiKeyId}:${rateLimitWindowMs}:${windowNumber}`;

        await redisClient.set(rateLimitRedisKey, "3", {
            PX: Math.max(1, windowEnd - Date.now())
        });
    });

    after(async () => {
        try {
            if (rateLimitRedisKey) {
                await redisClient.del(rateLimitRedisKey);
            }

            if (apiKeyId && windowNumber !== undefined) {
                await redisClient.del(
                    `keyflux:alert:${apiKeyId}:${rateLimitWindowMs}:RATE_LIMIT_WARNING:${windowNumber}`
                );

                await redisClient.del(
                    `keyflux:alert:${apiKeyId}:${rateLimitWindowMs}:RATE_LIMIT_EXCEEDED:${windowNumber}`
                );
            }

            await pool.query(
                "DELETE FROM users WHERE email = $1",
                [email]
            );
        } finally {
            if (redisClient.isOpen) {
                await redisClient.quit();
            }
        }
    });

    // Test 1: Alert creation and deduplication.
    it("should create one warning and one exceeded alert per rate-limit window", async () => {
        const warningResponse = await request(app)
            .get("/api/v1/protected")
            .set("x-api-key", apiKey);

        assert.equal(warningResponse.status, 200);

        const secondWarningResponse = await request(app)
            .get("/api/v1/protected")
            .set("x-api-key", apiKey);

        assert.equal(secondWarningResponse.status, 200);

        const exceededResponse = await request(app)
            .get("/api/v1/protected")
            .set("x-api-key", apiKey);

        assert.equal(exceededResponse.status, 429);

        assert.equal(
            exceededResponse.body.error.code,
            "RATE_LIMIT_EXCEEDED"
        );

        const alerts = await pool.query(
            `SELECT
                alert_type,
                usage_count,
                rate_limit,
                window_ms
             FROM api_alerts
             WHERE project_id = $1
               AND api_key_id = $2
             ORDER BY alert_type`,
            [projectId, apiKeyId]
        );

        assert.equal(alerts.rows.length, 2);

        const warning = alerts.rows.find(
            alert => alert.alert_type === "RATE_LIMIT_WARNING"
        );

        const exceeded = alerts.rows.find(
            alert => alert.alert_type === "RATE_LIMIT_EXCEEDED"
        );

        assert.ok(warning);
        assert.ok(exceeded);

        assert.equal(Number(warning.usage_count), 4);
        assert.equal(Number(warning.rate_limit), 5);

        assert.equal(Number(exceeded.usage_count), 6);
        assert.equal(Number(exceeded.rate_limit), 5);

        assert.equal(Number(warning.window_ms), rateLimitWindowMs);
        assert.equal(Number(exceeded.window_ms), rateLimitWindowMs);
    });

    // Test 2: Webhook delivery queue creation.
    it("should queue pending deliveries only for subscribed webhooks", async () => {
        const result = await pool.query(
            `SELECT
                w.name,
                a.alert_type,
                d.status
             FROM webhook_deliveries d
             JOIN webhooks w ON w.id = d.webhook_id
             JOIN api_alerts a ON a.id = d.alert_id
             WHERE a.project_id = $1
             ORDER BY w.name`,
            [projectId]
        );

        assert.equal(result.rows.length, 2);

        assert.deepEqual(result.rows, [
            {
                name: "Exceeded Subscriber",
                alert_type: "RATE_LIMIT_EXCEEDED",
                status: "PENDING"
            },
            {
                name: "Warning Subscriber",
                alert_type: "RATE_LIMIT_WARNING",
                status: "PENDING"
            }
        ]);
    });

    // Test 3: List alerts with pagination.
    it("should list project alerts with pagination", async () => {
        const response = await request(app)
            .get("/api/v1/alerts?page=1&limit=10")
            .set("x-api-key", managementApiKey);

        assert.equal(response.status, 200);
        assert.equal(response.body.success, true);
        assert.ok(Array.isArray(response.body.data.alerts));
        assert.ok(response.body.data.alerts.length >= 2);
        assert.equal(response.body.data.pagination.page, 1);
        assert.equal(response.body.data.pagination.limit, 10);
        assert.ok(response.body.data.pagination.total >= 2);
    });

    // Test 4: Filter alerts by type.
    it("should filter alerts by alert type", async () => {
        const response = await request(app)
            .get("/api/v1/alerts?alertType=RATE_LIMIT_WARNING")
            .set("x-api-key", managementApiKey);

        assert.equal(response.status, 200);
        assert.ok(response.body.data.alerts.length >= 1);

        assert.ok(
            response.body.data.alerts.every(
                alert => alert.alert_type === "RATE_LIMIT_WARNING"
            )
        );
    });

    // Test 5: Reject invalid alert type.
    it("should reject an invalid alert type", async () => {
        const response = await request(app)
            .get("/api/v1/alerts?alertType=INVALID")
            .set("x-api-key", managementApiKey);

        assert.equal(response.status, 400);

        assert.equal(
            response.body.error.code,
            "INVALID_ALERT_TYPE"
        );
    });

    // Test 6: Reject invalid pagination.
    it("should reject invalid pagination parameters", async () => {
        const invalidPage = await request(app)
            .get("/api/v1/alerts?page=0")
            .set("x-api-key", managementApiKey);

        assert.equal(invalidPage.status, 400);

        assert.equal(
            invalidPage.body.error.code,
            "INVALID_PAGE"
        );

        const invalidLimit = await request(app)
            .get("/api/v1/alerts?limit=101")
            .set("x-api-key", managementApiKey);

        assert.equal(invalidLimit.status, 400);

        assert.equal(
            invalidLimit.body.error.code,
            "INVALID_LIMIT"
        );
    });

    // Test 7: Retrieve an individual alert.
    it("should retrieve an individual alert", async () => {
        const listResponse = await request(app)
            .get("/api/v1/alerts")
            .set("x-api-key", managementApiKey);

        assert.equal(listResponse.status, 200);

        const alertId = listResponse.body.data.alerts[0].id;

        const response = await request(app)
            .get(`/api/v1/alerts/${alertId}`)
            .set("x-api-key", managementApiKey);

        assert.equal(response.status, 200);
        assert.equal(response.body.success, true);

        assert.equal(
            String(response.body.data.id),
            String(alertId)
        );

        assert.equal(
            Number(response.body.data.project_id),
            Number(projectId)
        );
    });

    // Test 8: Reject invalid alert ID.
    it("should reject an invalid alert ID", async () => {
        const response = await request(app)
            .get("/api/v1/alerts/invalid")
            .set("x-api-key", managementApiKey);

        assert.equal(response.status, 400);

        assert.equal(
            response.body.error.code,
            "INVALID_ALERT_ID"
        );
    });

    // Test 9: Return 404 for nonexistent alert.
    it("should return 404 for a nonexistent alert", async () => {
        const response = await request(app)
            .get("/api/v1/alerts/999999999")
            .set("x-api-key", managementApiKey);

        assert.equal(response.status, 404);

        assert.equal(
            response.body.error.code,
            "ALERT_NOT_FOUND"
        );
    });
});
