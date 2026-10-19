
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

    const result = await pool.query(
      `SELECT id, project_id, expires_at, revoked_at
       FROM api_keys
       WHERE key_hash = $1
       LIMIT 1`,
      [keyHash]
    );

    const key = result.rows[0];

    if (!key) {
      return res.status(401).json({
        success: false,
        error: {
          code: "API_KEY_INVALID",
          message: "The API key is invalid."
        }
      });
    }

    if (key.revoked_at) {
      return res.status(401).json({
        success: false,
        error: {
          code: "API_KEY_REVOKED",
          message: "This API key has been revoked."
        }
      });
    }

    if (
      key.expires_at &&
      new Date(key.expires_at).getTime() <= Date.now()
    ) {
      return res.status(401).json({
        success: false,
        error: {
          code: "API_KEY_EXPIRED",
          message: "This API key has expired."
        }
      });
    }

    await pool.query(
      `UPDATE api_keys
       SET last_used_at = NOW()
       WHERE id = $1`,
      [key.id]
    );

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

