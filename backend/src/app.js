
import "./config/env.js";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import pool from "./config/database.js";
import redisClient from "./config/redis.js";

const app = express();

app.disable("x-powered-by");

app.use(helmet());

app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:5173"
  })
);

app.use(express.json({ limit: "100kb" }));

app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Welcome to KeyFlux API",
    version: "1.0.0"
  });
});

app.get("/api/health", (req, res) => {
  res.status(200).json({
    success: true,
    service: "keyflux-backend",
    status: "healthy",
    timestamp: new Date().toISOString()
  });
});

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

export default app;
