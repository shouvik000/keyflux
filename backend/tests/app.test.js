import { test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import app from "../src/app.js";

test("GET / should return KeyFlux welcome message", async () => {
    const response = await request(app).get("/");

    assert.equal(response.status, 200);
    assert.equal(response.body.success, true);
    assert.equal(response.body.message, "Welcome to KeyFlux API");
    assert.equal(response.body.version, "1.0.0");
});

test("GET /api/health should return healthy status", async () => {
    const response = await request(app).get("/api/health");

    assert.equal(response.status, 200);
    assert.equal(response.body.success, true);
    assert.equal(response.body.service, "keyflux-backend");
    assert.equal(response.body.status, "healthy");

    assert.ok(
        !Number.isNaN(Date.parse(response.body.timestamp)),
        "Timestamp should be a valid date"
    );
});

test("Health endpoint should not expose X-Powered-By header", async () => {
    const response = await request(app).get("/api/health");

    assert.equal(response.headers["x-powered-by"], undefined);
});
