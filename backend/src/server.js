
import "./config/env.js";
import app from "./app.js";
import pool from "./config/database.js";
import redisClient, { connectRedis } from "./config/redis.js";

const PORT = Number(process.env.PORT) || 5000;

let server;

async function startServer() {
  try {
    // Verify PostgreSQL is reachable.
    await pool.query("SELECT 1");
    console.log("PostgreSQL connected successfully.");

    // Connect to Redis.
    await connectRedis();
    await redisClient.ping();
    console.log("Redis connected successfully.");

    server = app.listen(PORT, "0.0.0.0", () => {
      console.log(`KeyFlux API running on port ${PORT}`);
      console.log(`Health check: http://localhost:${PORT}/api/health`);
      console.log(
        `Integration check: http://localhost:${PORT}/api/health/integrations`
      );
    });
  } catch (error) {
    console.error("Failed to start KeyFlux API:", error.message);

    await pool.end().catch(() => {});

    if (redisClient.isOpen) {
      await redisClient.quit().catch(() => {});
    }

    process.exitCode = 1;
  }
}

async function shutdown(signal) {
  console.log(`${signal} received. Shutting down KeyFlux API...`);

  if (server) {
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }

  await pool.end();

  if (redisClient.isOpen) {
    await redisClient.quit();
  }

  console.log("KeyFlux API stopped.");
}

process.on("SIGINT", () => {
  shutdown("SIGINT").catch((error) => {
    console.error("Shutdown error:", error.message);
    process.exitCode = 1;
  });
});

process.on("SIGTERM", () => {
  shutdown("SIGTERM").catch((error) => {
    console.error("Shutdown error:", error.message);
    process.exitCode = 1;
  });
});

startServer();
