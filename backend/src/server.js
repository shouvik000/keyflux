import "dotenv/config";
import app from "./app.js";

const PORT = Number(process.env.PORT) || 5000;

const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`KeyFlux API running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);
});

function shutdown(signal) {
  console.log(`${signal} received. Shutting down KeyFlux API...`);

  server.close((error) => {
    if (error) {
      console.error("Error while shutting down:", error);
      process.exitCode = 1;
      return;
    }

    console.log("KeyFlux API stopped.");
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));