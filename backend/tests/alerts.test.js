
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import request from "supertest";

import app from "../src/app.js";
import pool from "../src/config/database.js";
import { createApiKey } from "../src/services/apiKeyService.js";
import redisClient, { connectRedis } from "../src/config/redis.js";

describe("API Usage Alerts", () => {
    const email = `alert-test-${randomUUID()}@example.com`;
    const password = "KeyFlux_Alert_Test_2026!";

    const rateLimitMax = 5;
    const rateLimitWindowMs = 60000;

    let projectId;
    let apiKey;
    let apiKeyId;
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

        windowNumber = Math.floor(Date.now() / rateLimitWindowMs);

        const windowEnd = (windowNumber + 1) * rateLimitWindowMs;

        rateLimitRedisKey =
            `keyflux:rate-limit:${apiKeyId}:${rateLimitWindowMs}:${windowNumber}`;

        // Start at 3 requests. The next request reaches 80%.
        await redisClient.set(rateLimitRedisKey, "3", {
            PX: Math.max(1, windowEnd - Date.now())
        });
    });

    after(async () => {
        try {
            if (rateLimitRedisKey) {
                await redisClient.del(rateLimitRedisKey);
            }

            await redisClient.del(
                `keyflux:alert:${apiKeyId}:${rateLimitWindowMs}:RATE_LIMIT_WARNING:${windowNumber}`
            );

            await redisClient.del(
                `keyflux:alert:${apiKeyId}:${rateLimitWindowMs}:RATE_LIMIT_EXCEEDED:${windowNumber}`
            );

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

    it("should create one warning and one exceeded alert per rate-limit window", async () => {
        // Request 4 of 5: reaches 80%.
        const warningResponse = await request(app)
            .get("/api/v1/protected")
            .set("x-api-key", apiKey);

        assert.equal(warningResponse.status, 200);

        // Request 5 of 5: warning must not be duplicated.
        const secondWarningResponse = await request(app)
            .get("/api/v1/protected")
            .set("x-api-key", apiKey);

        assert.equal(secondWarningResponse.status, 200);

        // Request 6 of 5: must retain the existing 429 response.
        const exceededResponse = await request(app)
            .get("/api/v1/protected")
            .set("x-api-key", apiKey);

        assert.equal(exceededResponse.status, 429);

        assert.equal(
            exceededResponse.body.error.code,
            "RATE_LIMIT_EXCEEDED"
        );

        // Verify alerts stored in PostgreSQL.
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
});
