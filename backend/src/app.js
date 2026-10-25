
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

const app = express();

app.disable("x-powered-by");

app.use(helmet());

app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:5173"
  })
);

app.use(express.json({ limit: "100kb" }));

// API key management routes
app.use("/api/v1/keys", apiKeyRoutes);

// API analytics routes
app.use("/api/v1/analytics", analyticsRoutes);

// Welcome endpoint
app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Welcome to KeyFlux API",
    version: "1.0.0"
  });
});

// Basic health check
app.get("/api/health", (req, res) => {
  res.status(200).json({
    success: true,
    service: "keyflux-backend",
    status: "healthy",
    timestamp: new Date().toISOString()
  });
});

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
