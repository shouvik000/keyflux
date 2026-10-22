
import { logApiUsage } from "../services/usageLogService.js";

export default function usageLogger(req, res, next) {
  const startTime = process.hrtime.bigint();

  res.once("finish", () => {
    // Only log requests that have been authenticated with an API key.
    if (!req.apiKey) {
      return;
    }

    const responseTimeMs = Number(
      (process.hrtime.bigint() - startTime) / 1_000_000n
    );

    logApiUsage({
      projectId: req.apiKey.projectId,
      apiKeyId: req.apiKey.id,
      httpMethod: req.method,
      // req.path excludes query-string values.
      requestPath: req.path,
      statusCode: res.statusCode,
      responseTimeMs
    }).catch((error) => {
      // Logging failures must not affect an already-sent API response.
      console.error("Failed to log API usage:", error.message);
    });
  });

  next();
}
