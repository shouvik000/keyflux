
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import request from "supertest";

import app from "../src/app.js";
import pool from "../src/config/database.js";
import { createApiKey } from "../src/services/apiKeyService.js";
import { logApiUsage } from "../src/services/usageLogService.js";
import redisClient, { connectRedis } from "../src/config/redis.js";

describe("Analytics API Integration Tests", () => {
    const email = `analytics-test-${randomUUID()}@example.com`;
    const password = "KeyFlux_Analytics_Test_2026!";

    const marker = randomUUID();
    const testPath = `/analytics-test/${marker}`;

    let projectId;
    let secondProjectId;

    let apiKey;
    let secondProjectApiKey;

    // Connect Redis and prepare test data.
    before(async () => {
        await connectRedis();

        // Register a temporary user.
        const registerResponse = await request(app)
            .post("/api/v1/auth/register")
            .send({
                name: "Analytics Test User",
                email,
                password
            });

        assert.equal(registerResponse.status, 201);

        // Login and obtain JWT.
        const loginResponse = await request(app)
            .post("/api/v1/auth/login")
            .send({ email, password });

        assert.equal(loginResponse.status, 200);

        const token = loginResponse.body.data.token;

        // Create the first project.
        const firstProjectResponse = await request(app)
            .post("/api/v1/projects")
            .set("Authorization", `Bearer ${token}`)
            .send({
                name: "Analytics Test Project",
                description: "Primary analytics test project."
            });

        assert.equal(firstProjectResponse.status, 201);

        projectId = firstProjectResponse.body.data.project.id;

        // Create a second project for isolation testing.
        const secondProjectResponse = await request(app)
            .post("/api/v1/projects")
            .set("Authorization", `Bearer ${token}`)
            .send({
                name: "Analytics Isolation Project",
                description: "Secondary analytics test project."
            });

        assert.equal(secondProjectResponse.status, 201);

        secondProjectId = secondProjectResponse.body.data.project.id;

        // Generate API keys for both projects.
        const firstKey = await createApiKey({
            projectId,
            name: "Analytics Test Key"
        });

        apiKey = firstKey.key;

        const secondKey = await createApiKey({
            projectId: secondProjectId,
            name: "Analytics Isolation Key"
        });

        secondProjectApiKey = secondKey.key;

        // Insert controlled usage records into the first project.
        await logApiUsage({
            projectId,
            httpMethod: "POST",
            requestPath: `${testPath}/orders`,
            statusCode: 201,
            responseTimeMs: 25
        });

        await logApiUsage({
            projectId,
            httpMethod: "POST",
            requestPath: `${testPath}/orders`,
            statusCode: 201,
            responseTimeMs: 35
        });

        await logApiUsage({
            projectId,
            httpMethod: "POST",
            requestPath: `${testPath}/orders`,
            statusCode: 201,
            responseTimeMs: 45
        });

        await logApiUsage({
            projectId,
            httpMethod: "PUT",
            requestPath: `${testPath}/missing`,
            statusCode: 404,
            responseTimeMs: 40
        });

        await logApiUsage({
            projectId,
            httpMethod: "DELETE",
            requestPath: `${testPath}/failure`,
            statusCode: 500,
            responseTimeMs: 60
        });

        // Insert a separate record into the second project.
        await logApiUsage({
            projectId: secondProjectId,
            httpMethod: "GET",
            requestPath: `/analytics-isolation/${marker}`,
            statusCode: 200,
            responseTimeMs: 15
        });

        console.log("Analytics test data prepared successfully.");
    });

    // Clean up temporary user and close Redis.
    after(async () => {
        try {
            await pool.query(
                "DELETE FROM users WHERE email = $1",
                [email]
            );

            console.log("Temporary analytics test user cleaned up.");
        } finally {
            if (redisClient.isOpen) {
                await redisClient.quit();
            }
        }
    });

    // 1. Authentication.
    it("should reject analytics requests without an API key", async () => {
        const response = await request(app)
            .get("/api/v1/analytics/overview");

        assert.equal(response.status, 401);
        assert.equal(
            response.body.error.code,
            "API_KEY_MISSING"
        );
    });

    // 2. Analytics overview.
    it("should return analytics overview for 7, 30, and 90 days", async () => {
        for (const days of [7, 30, 90]) {
            const response = await request(app)
                .get(`/api/v1/analytics/overview?days=${days}`)
                .set("x-api-key", apiKey);

            assert.equal(response.status, 200);
            assert.equal(response.body.success, true);
            assert.equal(response.body.periodDays, days);

            const data = response.body.data;

            assert.ok(data.total_requests >= 5);
            assert.ok(data.successful_requests >= 3);
            assert.ok(data.client_errors >= 1);
            assert.ok(data.server_errors >= 1);
            assert.ok(data.failed_requests >= 2);

            assert.equal(
                typeof data.average_response_time_ms,
                "number"
            );

            assert.equal(
                typeof data.error_rate_percentage,
                "number"
            );

            assert.ok(Array.isArray(data.requests_by_method));
        }
    });



    // 3. Response-time performance analytics.
    it("should return correct response-time percentiles and slowest endpoints", async () => {
        const response = await request(app)
            .get("/api/v1/analytics/performance?days=7")
            .set("x-api-key", apiKey);

        assert.equal(response.status, 200);
        assert.equal(response.body.success, true);
        assert.equal(response.body.periodDays, 7);

        const data = response.body.data;

        assert.ok(data.total_requests >= 5);

        assert.equal(
    typeof data.average_response_time_ms,
    "number"
    );

      assert.ok(data.p50_response_time_ms <= data.p95_response_time_ms);
      assert.ok(data.p95_response_time_ms <= data.p99_response_time_ms);

        assert.ok(Array.isArray(data.slowest_endpoints));
        assert.ok(data.slowest_endpoints.length > 0);
        assert.ok(data.slowest_endpoints.length <= 20);

        const ordersEndpoint = data.slowest_endpoints.find(
            (endpoint) =>
                endpoint.request_path === `${testPath}/orders` &&
                endpoint.http_method === "POST"
        );

        assert.ok(ordersEndpoint);
        assert.equal(ordersEndpoint.total_requests, 3);
        assert.equal(
            Number(ordersEndpoint.p50_response_time_ms),
            35
        );
        assert.equal(
            Number(ordersEndpoint.p95_response_time_ms),
            44
        );
        assert.equal(
            Number(ordersEndpoint.p99_response_time_ms),
            44.8
        );
    });


    // 3. Top endpoints.
    it("should return endpoint analytics with correct request counts", async () => {
        const response = await request(app)
            .get("/api/v1/analytics/endpoints?days=7")
            .set("x-api-key", apiKey);

        assert.equal(response.status, 200);
        assert.equal(response.body.success, true);

        const endpoints = response.body.data;

        assert.ok(Array.isArray(endpoints));
        assert.ok(endpoints.length > 0);
        assert.ok(endpoints.length <= 20);

        const ordersEndpoint = endpoints.find(
            (endpoint) =>
                endpoint.request_path === `${testPath}/orders` &&
                endpoint.http_method === "POST"
        );

        assert.ok(ordersEndpoint);

        assert.equal(ordersEndpoint.total_requests, 3);
        assert.equal(ordersEndpoint.successful_requests, 3);
    });

    // 4. Usage timeline.
    it("should return daily usage timeline", async () => {
        const response = await request(app)
            .get("/api/v1/analytics/timeline?days=7")
            .set("x-api-key", apiKey);

        assert.equal(response.status, 200);
        assert.equal(response.body.success, true);

        const timeline = response.body.data;

        assert.ok(Array.isArray(timeline));
        assert.ok(timeline.length > 0);

        const todayData = timeline.find(
            (item) => item.total_requests >= 5
        );

        assert.ok(todayData);

        assert.match(
            todayData.date,
            /^\d{4}-\d{2}-\d{2}$/
        );

        assert.ok(todayData.successful_requests >= 3);
        assert.ok(todayData.failed_requests >= 2);
    });

    // 5. Usage logs and filtering.
    it("should return usage logs filtered by method and status code", async () => {
        const response = await request(app)
            .get(
                "/api/v1/analytics/logs?days=7&method=POST&statusCode=201"
            )
            .set("x-api-key", apiKey);

        assert.equal(response.status, 200);
        assert.equal(response.body.success, true);

        const data = response.body.data;

        assert.ok(Array.isArray(data.logs));
        assert.equal(data.logs.length, 3);

        for (const log of data.logs) {
            assert.equal(log.http_method, "POST");
            assert.equal(log.status_code, 201);
            assert.equal(log.request_path, `${testPath}/orders`);
        }
    });

    // 6. Pagination.
    it("should paginate usage logs correctly", async () => {
        const firstPage = await request(app)
            .get(
                "/api/v1/analytics/logs?days=7&page=1&limit=2&method=POST&statusCode=201"
            )
            .set("x-api-key", apiKey);

        assert.equal(firstPage.status, 200);

        const firstPagination = firstPage.body.data.pagination;

        assert.equal(firstPage.body.data.logs.length, 2);
        assert.equal(firstPagination.total, 3);
        assert.equal(firstPagination.page, 1);
        assert.equal(firstPagination.limit, 2);
        assert.equal(firstPagination.totalPages, 2);
        assert.equal(firstPagination.hasNextPage, true);
        assert.equal(firstPagination.hasPreviousPage, false);

        const secondPage = await request(app)
            .get(
                "/api/v1/analytics/logs?days=7&page=2&limit=2&method=POST&statusCode=201"
            )
            .set("x-api-key", apiKey);

        assert.equal(secondPage.status, 200);

        const secondPagination = secondPage.body.data.pagination;

        assert.equal(secondPage.body.data.logs.length, 1);
        assert.equal(secondPagination.total, 3);
        assert.equal(secondPagination.page, 2);
        assert.equal(secondPagination.hasNextPage, false);
        assert.equal(secondPagination.hasPreviousPage, true);
    });

    // 7. Invalid query parameters.
    it("should reject invalid analytics query parameters", async () => {
        const invalidRequests = [
            {
                url: "/api/v1/analytics/overview?days=14",
                code: "INVALID_DAYS"
            },
            {
                url: "/api/v1/analytics/logs?page=0",
                code: "INVALID_PAGE"
            },
            {
                url: "/api/v1/analytics/logs?limit=101",
                code: "INVALID_LIMIT"
            },
            {
                url: "/api/v1/analytics/logs?method=TRACE",
                code: "INVALID_METHOD"
            },
            {
                url: "/api/v1/analytics/logs?statusCode=99",
                code: "INVALID_STATUS_CODE"
            }
        ];

        for (const testCase of invalidRequests) {
            const response = await request(app)
                .get(testCase.url)
                .set("x-api-key", apiKey);

            assert.equal(response.status, 400);
            assert.equal(
                response.body.error.code,
                testCase.code
            );
        }
    });


    // 8. Performance analytics project isolation.
    it("should only return performance analytics for the authenticated project", async () => {
        const response = await request(app)
            .get("/api/v1/analytics/performance?days=7")
            .set("x-api-key", secondProjectApiKey);

        assert.equal(response.status, 200);
        assert.equal(response.body.success, true);

        const data = response.body.data;

        assert.equal(data.total_requests, 1);
        assert.equal(data.p50_response_time_ms, 15);
        assert.equal(data.p95_response_time_ms, 15);
        assert.equal(data.p99_response_time_ms, 15);

        assert.equal(data.slowest_endpoints.length, 1);
        assert.equal(
            data.slowest_endpoints[0].request_path,
            `/analytics-isolation/${marker}`
        );
    });

    // 8. Project-level data isolation.
    it("should only return logs belonging to the authenticated project", async () => {
        const response = await request(app)
            .get("/api/v1/analytics/logs?days=7&limit=100")
            .set("x-api-key", secondProjectApiKey);

        assert.equal(response.status, 200);
        assert.equal(response.body.success, true);

        const logs = response.body.data.logs;

        const isolationLog = logs.find(
            (log) =>
                log.request_path === `/analytics-isolation/${marker}`
        );

        assert.ok(isolationLog);

        const firstProjectLog = logs.find(
            (log) => log.request_path.startsWith(testPath)
        );

        assert.equal(firstProjectLog, undefined);
    });
});
