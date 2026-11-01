
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import request from "supertest";

import app from "../src/app.js";
import pool from "../src/config/database.js";
import { createApiKey } from "../src/services/apiKeyService.js";
import redisClient, { connectRedis } from "../src/config/redis.js";

describe("API Key Management API", () => {
    const email = `api-key-test-${randomUUID()}@example.com`;
    const password = "KeyFlux_Test_Password_2026!";

    let token;
    let projectId;
    let bootstrapKey;
    let createdKeyId;
    let generatedKey;

    // Connect Redis and prepare temporary test data.
    before(async () => {
        await connectRedis();

        // Register a temporary user.
        const registerResponse = await request(app)
            .post("/api/v1/auth/register")
            .send({
                name: "API Key Test User",
                email,
                password
            });

        assert.equal(registerResponse.status, 201);

        // Log in and obtain JWT.
        const loginResponse = await request(app)
            .post("/api/v1/auth/login")
            .send({ email, password });

        assert.equal(loginResponse.status, 200);
        token = loginResponse.body.data.token;

        // Create a temporary project.
        const projectResponse = await request(app)
            .post("/api/v1/projects")
            .set("Authorization", `Bearer ${token}`)
            .send({
                name: "API Key Test Project",
                description: "Temporary project for API key tests."
            });

        assert.equal(projectResponse.status, 201);
        projectId = projectResponse.body.data.project.id;

        // Generate a bootstrap key for key management requests.
        const bootstrap = await createApiKey({
            projectId,
            name: "API Key Test Bootstrap"
        });

        bootstrapKey = bootstrap.key;
    });

    // Clean up temporary data and close Redis.
    after(async () => {
        try {
            await pool.query(
                "DELETE FROM users WHERE email = $1",
                [email]
            );

            console.log("Temporary API key test user cleaned up.");
        } finally {
            if (redisClient.isOpen) {
                await redisClient.quit();
            }
        }
    });

    it("should reject requests without an API key", async () => {
        const response = await request(app)
            .get("/api/v1/keys");

        assert.equal(response.status, 401);
        assert.equal(
            response.body.error.code,
            "API_KEY_MISSING"
        );
    });

    it("should create a new API key", async () => {
        const response = await request(app)
            .post("/api/v1/keys")
            .set("x-api-key", bootstrapKey)
            .send({
                name: "API Key Creation Test"
            });

        assert.equal(response.status, 201);
        assert.equal(response.body.success, true);

        generatedKey = response.body.data.key;
        createdKeyId = response.body.data.apiKey.id;

        assert.ok(generatedKey.startsWith("kf_live_"));
        assert.ok(createdKeyId);

        // Ensure the database hash is not exposed.
        assert.equal(
            response.body.data.apiKey.key_hash,
            undefined
        );
    });

    it("should reject API key creation with an invalid name", async () => {
        const response = await request(app)
            .post("/api/v1/keys")
            .set("x-api-key", bootstrapKey)
            .send({});

        assert.equal(response.status, 400);
        assert.equal(
            response.body.error.code,
            "INVALID_API_KEY_INPUT"
        );
    });

    it("should list API keys without exposing their hashes", async () => {
        const response = await request(app)
            .get("/api/v1/keys")
            .set("x-api-key", bootstrapKey);

        assert.equal(response.status, 200);
        assert.equal(response.body.success, true);
        assert.ok(Array.isArray(response.body.data));

        const createdKey = response.body.data.find(
            (key) => key.id === createdKeyId
        );

        assert.ok(createdKey);
        assert.equal(
            createdKey.name,
            "API Key Creation Test"
        );
        assert.equal(createdKey.key_hash, undefined);
    });

    it("should revoke an API key", async () => {
        const response = await request(app)
            .delete(`/api/v1/keys/${createdKeyId}`)
            .set("x-api-key", bootstrapKey);

        assert.equal(response.status, 200);
        assert.equal(response.body.success, true);
        assert.equal(response.body.data.id, createdKeyId);
        assert.ok(response.body.data.revoked_at);
    });

    it("should reject authentication using a revoked API key", async () => {
        const response = await request(app)
            .get("/api/v1/protected")
            .set("x-api-key", generatedKey);

        assert.equal(response.status, 401);
        assert.equal(
            response.body.error.code,
            "API_KEY_REVOKED"
        );
    });

    it("should return 404 when revoking an already revoked key", async () => {
        const response = await request(app)
            .delete(`/api/v1/keys/${createdKeyId}`)
            .set("x-api-key", bootstrapKey);

        assert.equal(response.status, 404);
        assert.equal(
            response.body.error.code,
            "API_KEY_NOT_FOUND"
        );
    });
});

