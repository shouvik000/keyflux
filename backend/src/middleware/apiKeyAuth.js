
import pool from "../config/database.js";
import { hashApiKey } from "../utils/apiKey.js";

export async function apiKeyAuth(req, res, next) {
  try {
    const apiKey = req.get("x-api-key");

    if (!apiKey) {
      return res.status(401).json({
        success: false,
        error: {
          code: "API_KEY_MISSING",
          message: "Provide an API key in the x-api-key header."
        }
      });
    }

    if (apiKey.length > 200 || !apiKey.startsWith("kf_live_")) {
      return res.status(401).json({
        success: false,
        error: {
          code: "API_KEY_INVALID",
          message: "The API key is invalid."
        }
      });
    }

    const keyHash = hashApiKey(apiKey);

    // Atomically validate the key and update its last-used timestamp.
    const result = await pool.query(
      `UPDATE api_keys
       SET last_used_at = NOW()
       WHERE key_hash = $1
         AND revoked_at IS NULL
         AND (expires_at IS NULL OR expires_at > NOW())
       RETURNING id, project_id`,
      [keyHash]
    );

    const key = result.rows[0];

    // No active key was updated. Determine why authentication failed.
    if (!key) {
      const statusResult = await pool.query(
        `SELECT
           revoked_at IS NOT NULL AS is_revoked,
           expires_at IS NOT NULL AND expires_at <= NOW() AS is_expired
         FROM api_keys
         WHERE key_hash = $1
         LIMIT 1`,
        [keyHash]
      );

      const status = statusResult.rows[0];

      if (!status) {
        return res.status(401).json({
          success: false,
          error: {
            code: "API_KEY_INVALID",
            message: "The API key is invalid."
          }
        });
      }

      if (status.is_revoked) {
        return res.status(401).json({
          success: false,
          error: {
            code: "API_KEY_REVOKED",
            message: "This API key has been revoked."
          }
        });
      }

      if (status.is_expired) {
        return res.status(401).json({
          success: false,
          error: {
            code: "API_KEY_EXPIRED",
            message: "This API key has expired."
          }
        });
      }

      return res.status(401).json({
        success: false,
        error: {
          code: "API_KEY_INVALID",
          message: "The API key is invalid."
        }
      });
    }

    req.apiKey = {
      id: key.id,
      projectId: key.project_id
    };

    return next();
  } catch (error) {
    console.error("API key authentication failed:", error);

    return res.status(500).json({
      success: false,
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "An internal server error occurred."
      }
    });
  }
}
