
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import request from "supertest";

import app from "../src/app.js";
import pool from "../src/config/database.js";
import { createApiKey } from "../src/services/apiKeyService.js";
import { decryptWebhookSecret } from "../src/services/webhookCrypto.js";
import redisClient, { connectRedis } from "../src/config/redis.js";

describe("Webhook Management API", () => {
    const email = `webhook-test-${randomUUID()}@example.com`;
    const password = "KeyFlux_Webhook_Test_2026!";

    let projectId;
    let secondProjectId;
    let managementKey;
    let secondProjectKey;
    let webhookId;
    let webhookSecret;
    let deliveryId;

    before(async () => {
        await connectRedis();

        const registerResponse = await request(app)
            .post("/api/v1/auth/register")
            .send({
                name: "Webhook Test User",
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
                name: "Webhook Test Project",
                description: "Temporary project for webhook tests."
            });

        assert.equal(projectResponse.status, 201);

        projectId = projectResponse.body.data.project.id;

        const secondProjectResponse = await request(app)
            .post("/api/v1/projects")
            .set("Authorization", `Bearer ${token}`)
            .send({
                name: "Webhook Isolation Project",
                description: "Second project for isolation tests."
            });

        assert.equal(secondProjectResponse.status, 201);

        secondProjectId =
            secondProjectResponse.body.data.project.id;

        const firstKey = await createApiKey({
            projectId,
            name: "Webhook Management Test Key"
        });

        managementKey = firstKey.key;

        const secondKey = await createApiKey({
            projectId: secondProjectId,
            name: "Webhook Isolation Test Key"
        });

        secondProjectKey = secondKey.key;
    });

    after(async () => {
        try {
            await pool.query(
                "DELETE FROM users WHERE email = $1",
                [email]
            );

            console.log("Temporary webhook test user cleaned up.");
        } finally {
            if (redisClient.isOpen) {
                await redisClient.quit();
            }
        }
    });

    it("should reject requests without an API key", async () => {
        const response = await request(app)
            .get("/api/v1/webhooks");

        assert.equal(response.status, 401);
        assert.equal(
            response.body.error.code,
            "API_KEY_MISSING"
        );
    });

    it("should create a webhook and return its secret once", async () => {
        const response = await request(app)
            .post("/api/v1/webhooks")
            .set("x-api-key", managementKey)
            .send({
                name: "Production Webhook",
                url: "https://example.com/webhooks/keyflux",
                events: [
                    "RATE_LIMIT_WARNING",
                    "RATE_LIMIT_EXCEEDED"
                ]
            });

        assert.equal(response.status, 201);
        assert.equal(response.body.success, true);

        const webhook = response.body.data.webhook;

        webhookId = webhook.id;
        webhookSecret = response.body.data.secret;

        assert.ok(webhookId);
        assert.equal(webhook.name, "Production Webhook");
        assert.equal(webhook.project_id, projectId);

        assert.ok(webhookSecret);
        assert.equal(webhookSecret.length, 64);

        assert.deepEqual(
            webhook.events,
            [
                "RATE_LIMIT_WARNING",
                "RATE_LIMIT_EXCEEDED"
            ]
        );

        assert.equal(webhook.secret_encrypted, undefined);
    });

    it("should store the webhook secret encrypted in PostgreSQL", async () => {
        const result = await pool.query(
            `SELECT secret_encrypted
             FROM webhooks
             WHERE id = $1 AND project_id = $2`,
            [webhookId, projectId]
        );

        assert.equal(result.rows.length, 1);

        const encryptedSecret = result.rows[0].secret_encrypted;

        assert.notEqual(encryptedSecret, webhookSecret);

        assert.equal(
            decryptWebhookSecret(encryptedSecret),
            webhookSecret
        );
    });

    it("should list project webhooks without exposing secrets", async () => {
        const response = await request(app)
            .get("/api/v1/webhooks")
            .set("x-api-key", managementKey);

        assert.equal(response.status, 200);
        assert.equal(response.body.success, true);

        const webhook = response.body.data.webhooks.find(
            item => item.id === webhookId
        );

        assert.ok(webhook);
        assert.equal(webhook.secret, undefined);
        assert.equal(webhook.secret_encrypted, undefined);
    });

    it("should get a webhook by ID", async () => {
        const response = await request(app)
            .get(`/api/v1/webhooks/${webhookId}`)
            .set("x-api-key", managementKey);

        assert.equal(response.status, 200);
        assert.equal(response.body.data.webhook.id, webhookId);
    });

    it("should update webhook details", async () => {
        const response = await request(app)
            .patch(`/api/v1/webhooks/${webhookId}`)
            .set("x-api-key", managementKey)
            .send({
                name: "Updated Production Webhook",
                events: ["RATE_LIMIT_EXCEEDED"],
                isActive: false
            });

        assert.equal(response.status, 200);

        assert.equal(
            response.body.data.webhook.name,
            "Updated Production Webhook"
        );

        assert.deepEqual(
            response.body.data.webhook.events,
            ["RATE_LIMIT_EXCEEDED"]
        );

        assert.equal(
            response.body.data.webhook.is_active,
            false
        );
    });

    it("should reject an invalid webhook URL", async () => {
        const response = await request(app)
            .post("/api/v1/webhooks")
            .set("x-api-key", managementKey)
            .send({
                name: "Invalid URL Webhook",
                url: "http://example.com/webhook",
                events: ["RATE_LIMIT_WARNING"]
            });

        assert.equal(response.status, 400);

        assert.equal(
            response.body.error.code,
            "INVALID_WEBHOOK"
        );
    });

    it("should reject private IP webhook destinations", async () => {
        const response = await request(app)
            .post("/api/v1/webhooks")
            .set("x-api-key", managementKey)
            .send({
                name: "Private IP Webhook",
                url: "https://127.0.0.1/webhook",
                events: ["RATE_LIMIT_WARNING"]
            });

        assert.equal(response.status, 400);

        assert.equal(
            response.body.error.code,
            "INVALID_WEBHOOK"
        );
    });

    it("should reject invalid webhook events", async () => {
        const response = await request(app)
            .post("/api/v1/webhooks")
            .set("x-api-key", managementKey)
            .send({
                name: "Invalid Events Webhook",
                url: "https://example.com/webhook",
                events: ["USER_REGISTERED"]
            });

        assert.equal(response.status, 400);

        assert.equal(
            response.body.error.code,
            "INVALID_WEBHOOK_EVENTS"
        );
    });

    it("should reject empty webhook updates", async () => {
        const response = await request(app)
            .patch(`/api/v1/webhooks/${webhookId}`)
            .set("x-api-key", managementKey)
            .send({});

        assert.equal(response.status, 400);
    });

    it("should list webhook delivery history with pagination", async () => {
    const alertResult = await pool.query(
        `
        INSERT INTO api_alerts (
            project_id,
            alert_type,
            usage_count,
            rate_limit,
            window_ms
        )
        VALUES ($1, $2, $3, $4, $5)
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

    const alertId = alertResult.rows[0].id;

    const deliveryResult = await pool.query(
        `
        INSERT INTO webhook_deliveries (
            webhook_id,
            alert_id,
            status,
            attempts,
            response_status,
            response_body
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id
        `,
        [
            webhookId,
            alertId,
            "FAILED",
            1,
            500,
            "Internal Server Error"
        ]
    );

    deliveryId = deliveryResult.rows[0].id;

    const response = await request(app)
        .get(`/api/v1/webhooks/${webhookId}/deliveries?limit=10&offset=0`)
        .set("x-api-key", managementKey);

    assert.equal(response.status, 200);
    assert.equal(response.body.success, true);

    const deliveries = response.body.data.deliveries;

    assert.equal(deliveries.length, 1);
    assert.equal(deliveries[0].id, deliveryId);
    assert.equal(deliveries[0].status, "FAILED");
    assert.equal(deliveries[0].attempts, 1);
    assert.equal(deliveries[0].response_status, 500);
    assert.equal(
        deliveries[0].response_body,
        "Internal Server Error"
    );

    assert.deepEqual(
        response.body.data.pagination,
        {
            limit: 10,
            offset: 0,
            count: 1
        }
    );
});

    it("should prevent access from another project", async () => {
        const response = await request(app)
            .get(`/api/v1/webhooks/${webhookId}`)
            .set("x-api-key", secondProjectKey);

        assert.equal(response.status, 404);

        assert.equal(
            response.body.error.code,
            "WEBHOOK_NOT_FOUND"
        );
    });


     it("should prevent another project from accessing webhook delivery history", async () => {
    const response = await request(app)
        .get(`/api/v1/webhooks/${webhookId}/deliveries`)
        .set("x-api-key", secondProjectKey);

    assert.equal(response.status, 404);

    assert.equal(
        response.body.error.code,
        "WEBHOOK_NOT_FOUND"
    );
});


it("should reject invalid delivery pagination parameters", async () => {
    const invalidQueries = [
        "?limit=0",
        "?limit=101",
        "?limit=abc",
        "?offset=-1",
        "?offset=abc"
    ];

    for (const query of invalidQueries) {
        const response = await request(app)
            .get(`/api/v1/webhooks/${webhookId}/deliveries${query}`)
            .set("x-api-key", managementKey);

        assert.equal(response.status, 400);
        assert.equal(
            response.body.error.code,
            "INVALID_PAGINATION"
        );
    }
});
    it("should reject invalid webhook IDs", async () => {
        const response = await request(app)
            .get("/api/v1/webhooks/invalid")
            .set("x-api-key", managementKey);

        assert.equal(response.status, 400);

        assert.equal(
            response.body.error.code,
            "INVALID_WEBHOOK_ID"
        );
    });

    it("should delete a webhook", async () => {
        const response = await request(app)
            .delete(`/api/v1/webhooks/${webhookId}`)
            .set("x-api-key", managementKey);

        assert.equal(response.status, 200);
        assert.equal(response.body.success, true);

        const getResponse = await request(app)
            .get(`/api/v1/webhooks/${webhookId}`)
            .set("x-api-key", managementKey);

        assert.equal(getResponse.status, 404);
    });
});
