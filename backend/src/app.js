
import "./config/env.js";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import pool from "./config/database.js";
import redisClient from "./config/redis.js";

import { apiKeyAuth } from "./middleware/apiKeyAuth.js";
import { apiRateLimit } from "./middleware/apiRateLimit.js";
import usageLogger from "./middleware/usageLogger.js";

import analyticsRoutes from "./routes/analyticsRoutes.js";
import apiKeyRoutes from "./routes/apiKeyRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import projectRoutes from "./routes/projectRoutes.js";

import swaggerUi from "swagger-ui-express";
import swaggerSpec from "./config/swagger.js";

const app = express();

app.disable("x-powered-by");

app.use(helmet());

app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:5173"
  })
);

app.use(express.json({ limit: "100kb" }));

// Swagger API documentation
app.use(
  "/api-docs",
  swaggerUi.serve,
  swaggerUi.setup(swaggerSpec)
);

// OpenAPI JSON specification
app.get("/api-docs.json", (req, res) => {
  res.json(swaggerSpec);
});

// User authentication routes
app.use("/api/v1/auth", authRoutes);

// API key management routes
app.use("/api/v1/keys", apiKeyRoutes);

// API analytics routes
app.use("/api/v1/analytics", analyticsRoutes);

// Project management routes
app.use("/api/v1/projects", projectRoutes);

/**
 * @swagger
 * /:
 *   get:
 *     summary: Get API welcome message
 *     description: Returns the KeyFlux API welcome message and version.
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: API welcome message returned successfully.
 */

// Welcome endpoint
app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Welcome to KeyFlux API",
    version: "1.0.0"
  });
});

/**
 * @swagger
 * /api/health:
 *   get:
 *     summary: Check backend health
 *     description: Checks whether the KeyFlux backend service is responding.
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Backend is healthy.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 service:
 *                   type: string
 *                   example: keyflux-backend
 *                 status:
 *                   type: string
 *                   example: healthy
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *       500:
 *         description: Internal server error.
 */

// Basic health check
app.get("/api/health", (req, res) => {
  res.status(200).json({
    success: true,
    service: "keyflux-backend",
    status: "healthy",
    timestamp: new Date().toISOString()
  });
});

/**
 * @swagger
 * /api/health/integrations:
 *   get:
 *     summary: Check database and Redis health
 *     description: Checks PostgreSQL connectivity and Redis connectivity independently.
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Both integrations are connected.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 service:
 *                   type: string
 *                   example: keyflux-backend
 *                 integrations:
 *                   type: object
 *                   properties:
 *                     postgres:
 *                       type: string
 *                       enum: [connected, disconnected, unknown]
 *                       example: connected
 *                     redis:
 *                       type: string
 *                       enum: [connected, disconnected, unknown]
 *                       example: connected
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *       503:
 *         description: PostgreSQL or Redis is disconnected.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 service:
 *                   type: string
 *                   example: keyflux-backend
 *                 integrations:
 *                   type: object
 *                   properties:
 *                     postgres:
 *                       type: string
 *                       example: connected
 *                     redis:
 *                       type: string
 *                       example: disconnected
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 */

// PostgreSQL and Redis integration health check
app.get("/api/health/integrations", async (req, res) => {
  const results = {
    postgres: "unknown",
    redis: "unknown"
  };

  try {
    await pool.query("SELECT 1");
    results.postgres = "connected";
  } catch (error) {
    results.postgres = "disconnected";
    console.error("PostgreSQL health check failed:", error.message);
  }

  try {
    if (redisClient.isReady) {
      await redisClient.ping();
      results.redis = "connected";
    } else {
      results.redis = "disconnected";
    }
  } catch (error) {
    results.redis = "disconnected";
    console.error("Redis health check failed:", error.message);
  }

  const healthy =
    results.postgres === "connected" &&
    results.redis === "connected";

  res.status(healthy ? 200 : 503).json({
    success: healthy,
    service: "keyflux-backend",
    integrations: results,
    timestamp: new Date().toISOString()
  });
});

/**
 * @swagger
 * /api/v1/protected:
 *   get:
 *     summary: Access protected API endpoint
 *     description: Verifies an API key, records usage, and applies Redis-based rate limiting.
 *     tags: [Protected]
 *     security:
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: API key authenticated successfully.
 *         headers:
 *           RateLimit-Limit:
 *             description: Maximum requests allowed in the current rate-limit window.
 *             schema:
 *               type: integer
 *               example: 100
 *           RateLimit-Remaining:
 *             description: Requests remaining in the current window.
 *             schema:
 *               type: integer
 *               example: 99
 *           RateLimit-Reset:
 *             description: Unix timestamp when the rate-limit window resets.
 *             schema:
 *               type: integer
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: API key authenticated successfully.
 *                 projectId:
 *                   type: integer
 *                   example: 3
 *                 apiKeyId:
 *                   type: integer
 *                   example: 7
 *       401:
 *         description: API key missing, invalid, revoked, or expired.
 *       429:
 *         description: Request rate limit exceeded.
 *       500:
 *         description: Internal server error during API key authentication.
 *       503:
 *         description: Redis rate limiter unavailable.
 */

// Protected endpoint: authenticate first, then enforce rate limits.
app.get(
  "/api/v1/protected",
  apiKeyAuth,
  usageLogger,
  apiRateLimit,
  (req, res) => {
    res.status(200).json({
      success: true,
      message: "API key authenticated successfully.",
      projectId: req.apiKey.projectId,
      apiKeyId: req.apiKey.id
    });
  }
);

export default app;
