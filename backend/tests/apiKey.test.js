
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


    it("should update last_used_at after successful API key authentication", async () => {
        const created = await createApiKey({
            projectId,
            name: "Last Used Tracking Test"
        });

        const apiKeyId = created.apiKey.id;

        // Initially, the key should not have been used.
        const before = await pool.query(
            "SELECT last_used_at FROM api_keys WHERE id = $1",
            [apiKeyId]
        );

        assert.equal(before.rows[0].last_used_at, null);

        // Authenticate using the newly created key.
        const response = await request(app)
            .get("/api/v1/protected")
            .set("x-api-key", created.key);

        assert.equal(response.status, 200);
        assert.equal(response.body.success, true);

        // Verify that last_used_at was updated.
        const after = await pool.query(
            "SELECT last_used_at FROM api_keys WHERE id = $1",
            [apiKeyId]
        );

        assert.ok(after.rows[0].last_used_at);
        assert.ok(
            new Date(after.rows[0].last_used_at).getTime() > 0
        );
    });

    it("should reject expired API keys without updating last_used_at", async () => {
        const created = await createApiKey({
            projectId,
            name: "Expired API Key Test"
        });

        const apiKeyId = created.apiKey.id;

        // Manually expire the key for testing.
        await pool.query(
            `UPDATE api_keys
             SET expires_at = NOW() - INTERVAL '1 minute'
             WHERE id = $1`,
            [apiKeyId]
        );

        const response = await request(app)
            .get("/api/v1/protected")
            .set("x-api-key", created.key);

        assert.equal(response.status, 401);
        assert.equal(
            response.body.error.code,
            "API_KEY_EXPIRED"
        );

        // Failed authentication must not update last_used_at.
        const result = await pool.query(
            "SELECT last_used_at FROM api_keys WHERE id = $1",
            [apiKeyId]
        );

        assert.equal(result.rows[0].last_used_at, null);
    });




    it("should return usage statistics for an API key", async () => {
        const targetKey = await createApiKey({
            projectId,
            name: "Usage Statistics Test"
        });

        // Generate a successful request using the target key.
        const protectedResponse = await request(app)
            .get("/api/v1/protected")
            .set("x-api-key", targetKey.key);

        assert.equal(protectedResponse.status, 200);

        // Retrieve usage statistics using the bootstrap key.
        const response = await request(app)
            .get(`/api/v1/keys/${targetKey.apiKey.id}/usage?days=7`)
            .set("x-api-key", bootstrapKey);

        assert.equal(response.status, 200);
        assert.equal(response.body.success, true);

        const data = response.body.data;

        assert.ok(data.total_requests >= 1);
        assert.ok(data.successful_requests >= 1);
        assert.equal(typeof data.client_errors, "number");
        assert.equal(typeof data.server_errors, "number");
        assert.equal(typeof data.failed_requests, "number");
        assert.equal(typeof data.average_response_time_ms, "number");
        assert.ok(Array.isArray(data.timeline));
    });

    it("should reject invalid usage statistics day ranges", async () => {
        const response = await request(app)
            .get(`/api/v1/keys/${createdKeyId}/usage?days=14`)
            .set("x-api-key", bootstrapKey);

        assert.equal(response.status, 400);
        assert.equal(response.body.error.code, "INVALID_DAYS");
    });

    it("should return 404 for a nonexistent API key usage request", async () => {
        const response = await request(app)
            .get("/api/v1/keys/999999/usage")
            .set("x-api-key", bootstrapKey);

        assert.equal(response.status, 404);
        assert.equal(
            response.body.error.code,
            "API_KEY_NOT_FOUND"
        );
    });

    it("should prevent access to usage statistics from another project", async () => {
        // Create another project belonging to the test user.
        const projectResponse = await request(app)
            .post("/api/v1/projects")
            .set("Authorization", `Bearer ${token}`)
            .send({
                name: "API Key Isolation Test Project",
                description: "Temporary project for usage isolation testing."
            });

        assert.equal(projectResponse.status, 201);

        const otherProjectId = projectResponse.body.data.project.id;

        // Generate an API key belonging to the other project.
        const otherProjectKey = await createApiKey({
            projectId: otherProjectId,
            name: "Other Project Test Key"
        });

        // Attempt to access a key belonging to the original project.
        const response = await request(app)
            .get(`/api/v1/keys/${createdKeyId}/usage?days=7`)
            .set("x-api-key", otherProjectKey.key);

        assert.equal(response.status, 404);
        assert.equal(
            response.body.error.code,
            "API_KEY_NOT_FOUND"
        );
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

        it("should successfully rotate an API key", async () => {
        const oldKey = await createApiKey({
            projectId,
            name: "Rotation Success Test"
        });

        const response = await request(app)
            .post(`/api/v1/keys/${oldKey.apiKey.id}/rotate`)
            .set("x-api-key", bootstrapKey);

        assert.equal(response.status, 200);
        assert.equal(response.body.success, true);

        const newKey = response.body.data.key;
        const newKeyId = response.body.data.apiKey.id;

        assert.ok(newKey.startsWith("kf_live_"));
        assert.ok(newKeyId);
        assert.equal(
            response.body.data.apiKey.name,
            "Rotation Success Test"
        );

        // Verify the old key has been revoked.
        const oldKeyResult = await pool.query(
            "SELECT revoked_at FROM api_keys WHERE id = $1",
            [oldKey.apiKey.id]
        );

        assert.ok(oldKeyResult.rows[0].revoked_at);

        // Verify the new key works.
        const newKeyResponse = await request(app)
            .get("/api/v1/protected")
            .set("x-api-key", newKey);

        assert.equal(newKeyResponse.status, 200);

        // Verify the old key no longer works.
        const oldKeyResponse = await request(app)
            .get("/api/v1/protected")
            .set("x-api-key", oldKey.key);

        assert.equal(oldKeyResponse.status, 401);
        assert.equal(
            oldKeyResponse.body.error.code,
            "API_KEY_REVOKED"
        );
    });

    it("should reject rotation with an invalid API key ID", async () => {
        const response = await request(app)
            .post("/api/v1/keys/invalid/rotate")
            .set("x-api-key", bootstrapKey);

        assert.equal(response.status, 400);
        assert.equal(
            response.body.error.code,
            "INVALID_API_KEY_ID"
        );
    });

    it("should return 404 when rotating an already revoked API key", async () => {
        const targetKey = await createApiKey({
            projectId,
            name: "Already Revoked Rotation Test"
        });

        // Revoke the key first.
        const revokeResponse = await request(app)
            .delete(`/api/v1/keys/${targetKey.apiKey.id}`)
            .set("x-api-key", bootstrapKey);

        assert.equal(revokeResponse.status, 200);

        // Attempt to rotate the revoked key.
        const response = await request(app)
            .post(`/api/v1/keys/${targetKey.apiKey.id}/rotate`)
            .set("x-api-key", bootstrapKey);

        assert.equal(response.status, 404);
        assert.equal(
            response.body.error.code,
            "API_KEY_NOT_FOUND"
        );
    });

    it("should prevent rotating an API key belonging to another project", async () => {
        const targetKey = await createApiKey({
            projectId,
            name: "Project Isolation Rotation Test"
        });

        // Create another project.
        const projectResponse = await request(app)
            .post("/api/v1/projects")
            .set("Authorization", `Bearer ${token}`)
            .send({
                name: "Rotation Isolation Test Project",
                description: "Temporary project for rotation isolation testing."
            });

        assert.equal(projectResponse.status, 201);

        const otherProjectId =
            projectResponse.body.data.project.id;

        const otherProjectKey = await createApiKey({
            projectId: otherProjectId,
            name: "Other Project Rotation Key"
        });

        // Authenticate with another project's key.
        const response = await request(app)
            .post(`/api/v1/keys/${targetKey.apiKey.id}/rotate`)
            .set("x-api-key", otherProjectKey.key);

        assert.equal(response.status, 404);
        assert.equal(
            response.body.error.code,
            "API_KEY_NOT_FOUND"
        );
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
