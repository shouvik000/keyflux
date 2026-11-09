
import { Router } from "express";

import { apiKeyAuth } from "../middleware/apiKeyAuth.js";
import { apiRateLimit } from "../middleware/apiRateLimit.js";
import usageLogger from "../middleware/usageLogger.js";

import {
  createApiKey,
  listApiKeys,
  revokeApiKey,
  getApiKeyUsage,
  rotateApiKey,
  getApiKeyInsights,
  getApiKeyRateLimit
} from "../services/apiKeyService.js";

const router = Router();

/**
 * @swagger
 * components:
 *   schemas:
 *     CreateApiKeyRequest:
 *       type: object
 *       required:
 *         - name
 *       properties:
 *         name:
 *           type: string
 *           maxLength: 100
 *           example: Production API Key
 *         expiresAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *           example: "2027-12-31T23:59:59.000Z"
 *         rateLimitMax:
 *           type: integer
 *           minimum: 1
 *           default: 100
 *           example: 200
 *           description: Maximum requests allowed per time window.
 *         rateLimitWindowMs:
 *           type: integer
 *           minimum: 1
 *           default: 60000
 *           example: 60000
 *           description: Rate-limit window duration in milliseconds.
 *
 *     ApiKey:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           example: 12
 *         project_id:
 *           type: integer
 *           example: 3
 *         name:
 *           type: string
 *           example: Production API Key
 *         key_prefix:
 *           type: string
 *           example: kf_live_abcd
 *         rate_limit_max:
 *           type: integer
 *           example: 100
 *         rate_limit_window_ms:
 *           type: integer
 *           example: 60000
 *         last_used_at:
 *           type: string
 *           format: date-time
 *           nullable: true
 *         expires_at:
 *           type: string
 *           format: date-time
 *           nullable: true
 *         revoked_at:
 *           type: string
 *           format: date-time
 *           nullable: true
 *         created_at:
 *           type: string
 *           format: date-time
 *
 *     ApiKeyError:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: false
 *         error:
 *           type: object
 *           properties:
 *             code:
 *               type: string
 *               example: API_KEY_INVALID
 *             message:
 *               type: string
 *               example: The API key is invalid.
 */

/**
 * @swagger
 * /api/v1/keys:
 *   get:
 *     summary: List API keys
 *     description: Returns API keys belonging to the authenticated project.
 *     tags: [API Keys]
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         required: false
 *         schema:
 *           type: string
 *           enum: [all, active, expired, revoked]
 *           default: all
 *         description: Filter API keys by lifecycle status.
 *       - in: query
 *         name: expiringWithinDays
 *         required: false
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 365
 *         description: Return active API keys expiring within the specified number of days.
 *     responses:
 *       200:
 *         description: API keys retrieved successfully.
 *       400:
 *         description: Invalid filter parameters.
 *       401:
 *         description: API key missing, invalid, revoked, or expired.
 *       500:
 *         description: Internal server error.
 *
 *   post:
 *     summary: Create an API key
 *     description: Creates a new API key with optional expiration and custom rate limits. The full key is returned only once.
 *     tags: [API Keys]
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateApiKeyRequest'
 *     responses:
 *       201:
 *         description: API key created successfully.
 *       400:
 *         description: Invalid API key input.
 *       401:
 *         description: API key missing, invalid, revoked, or expired.
 *       500:
 *         description: Internal server error.
 */

/**
 * @swagger
 * /api/v1/keys/insights:
 *   get:
 *     summary: Get API key usage insights
 *     description: Returns unused, recently used, and expiring soon active API keys.
 *     tags: [API Keys]
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: query
 *         name: recentWithinDays
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 365
 *           default: 7
 *       - in: query
 *         name: expiringWithinDays
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 365
 *           default: 7
 *     responses:
 *       200:
 *         description: API key usage insights retrieved successfully.
 *       400:
 *         description: Invalid insight window.
 *       401:
 *         description: API key missing or invalid.
 */

/**
 * @swagger
 * /api/v1/keys/{id}/usage:
 *   get:
 *     summary: Get API key usage statistics
 *     description: Returns usage statistics for a specific API key belonging to the authenticated project.
 *     tags: [API Keys]
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: ID of the API key.
 *       - in: query
 *         name: days
 *         required: false
 *         schema:
 *           type: integer
 *           enum: [7, 30, 90]
 *           default: 7
 *         description: Number of days of usage history.
 *     responses:
 *       200:
 *         description: API key usage statistics retrieved successfully.
 *       400:
 *         description: Invalid API key ID or days parameter.
 *       401:
 *         description: API key missing, invalid, revoked, or expired.
 *       404:
 *         description: API key not found in the authenticated project.
 *       500:
 *         description: Internal server error.
 */

/**
 * @swagger
 * /api/v1/keys/{id}/rotate:
 *   post:
 *     summary: Rotate an API key
 *     description: Generates a replacement API key and revokes the existing key. The new plaintext key is returned only once.
 *     tags: [API Keys]
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: ID of the API key to rotate.
 *     responses:
 *       200:
 *         description: API key rotated successfully.
 *       400:
 *         description: Invalid API key ID.
 *       401:
 *         description: API key missing, invalid, revoked, or expired.
 *       404:
 *         description: API key not found or already revoked.
 *       409:
 *         description: The API key has expired and cannot be rotated.
 *       500:
 *         description: Internal server error.
 */

/**
 * @swagger
 * /api/v1/keys/{id}:
 *   delete:
 *     summary: Revoke an API key
 *     description: Revokes an API key belonging to the authenticated project. An already revoked or unknown key returns 404.
 *     tags: [API Keys]
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: ID of the API key to revoke.
 *     responses:
 *       200:
 *         description: API key revoked successfully.
 *       400:
 *         description: Invalid API key ID.
 *       401:
 *         description: API key missing, invalid, revoked, or expired.
 *       404:
 *         description: API key not found or already revoked.
 *       500:
 *         description: Internal server error.
 */

// Authenticate requests and apply the existing middleware.
router.use(apiKeyAuth, usageLogger, apiRateLimit);

// GET /api/v1/keys
// List keys belonging to the authenticated project.
router.get("/", async (req, res, next) => {
  try {
    const {
      status = "all",
      expiringWithinDays = null
    } = req.query;

    const data = await listApiKeys({
      projectId: req.apiKey.projectId,
      status,
      expiringWithinDays
    });

    res.status(200).json({
      success: true,
      data
    });
  } catch (error) {
    if (
      error.code === "INVALID_API_KEY_STATUS" ||
      error.code === "INVALID_EXPIRATION_WINDOW"
    ) {
      return res.status(400).json({
        success: false,
        error: {
          code: error.code,
          message: error.message
        }
      });
    }

    next(error);
  }
});

// POST /api/v1/keys
// Create a new key for the authenticated project.
router.post("/", async (req, res, next) => {
  try {
    const {
      name,
      expiresAt = null,
      rateLimitMax = 100,
      rateLimitWindowMs = 60000
    } = req.body ?? {};

    const result = await createApiKey({
      projectId: req.apiKey.projectId,
      name,
      expiresAt,
      rateLimitMax,
      rateLimitWindowMs
    });

    res.status(201).json({
      success: true,
      message:
        "API key created successfully. Save the key now; it will not be shown again.",
      data: result
    });
  } catch (error) {
    if (error instanceof TypeError) {
      return res.status(400).json({
        success: false,
        error: {
          code: "INVALID_API_KEY_INPUT",
          message: error.message
        }
      });
    }

    next(error);
  }
});

// GET /api/v1/keys/insights
router.get("/insights", async (req, res, next) => {
  try {
    const {
      recentWithinDays = "7",
      expiringWithinDays = "7"
    } = req.query;

    const data = await getApiKeyInsights({
      projectId: req.apiKey.projectId,
      recentWithinDays,
      expiringWithinDays
    });

    res.status(200).json({
      success: true,
      data
    });
  } catch (error) {
    if (
      error.code === "INVALID_RECENT_WINDOW" ||
      error.code === "INVALID_EXPIRATION_WINDOW"
    ) {
      return res.status(400).json({
        success: false,
        error: {
          code: error.code,
          message: error.message
        }
      });
    }

    next(error);
  }
});

// GET /api/v1/keys/:id/usage
// Get usage statistics for a specific API key.
router.get("/:id/usage", async (req, res, next) => {
  try {
    const { days = "7" } = req.query;

    if (!["7", "30", "90"].includes(String(days))) {
      return res.status(400).json({
        success: false,
        error: {
          code: "INVALID_DAYS",
          message: "days must be 7, 30, or 90."
        }
      });
    }

    const data = await getApiKeyUsage({
      projectId: req.apiKey.projectId,
      apiKeyId: req.params.id,
      days: Number(days)
    });

    if (!data) {
      return res.status(404).json({
        success: false,
        error: {
          code: "API_KEY_NOT_FOUND",
          message:
            "The API key was not found in the authenticated project."
        }
      });
    }

    res.status(200).json({
      success: true,
      data
    });
  } catch (error) {
    if (error instanceof TypeError) {
      return res.status(400).json({
        success: false,
        error: {
          code: "INVALID_API_KEY_ID",
          message: error.message
        }
      });
    }

    next(error);
  }
});


// GET /api/v1/keys/:id/rate-limit
// Get current rate-limit usage for a specific API key.
router.get("/:id/rate-limit", async (req, res, next) => {
  try {
    const data = await getApiKeyRateLimit({
      projectId: req.apiKey.projectId,
      apiKeyId: req.params.id
    });

    if (!data) {
      return res.status(404).json({
        success: false,
        error: {
          code: "API_KEY_NOT_FOUND",
          message:
            "The API key was not found in the authenticated project."
        }
      });
    }

    return res.status(200).json({
      success: true,
      data
    });
  } catch (error) {
    if (error instanceof TypeError) {
      return res.status(400).json({
        success: false,
        error: {
          code: "INVALID_API_KEY_ID",
          message: error.message
        }
      });
    }

    if (error.code === "RATE_LIMITER_UNAVAILABLE") {
      return res.status(503).json({
        success: false,
        error: {
          code: error.code,
          message: error.message
        }
      });
    }

    next(error);
  }
});

// POST /api/v1/keys/:id/rotate
// Generate a replacement key and revoke the previous key.
router.post("/:id/rotate", async (req, res, next) => {
  try {
    const result = await rotateApiKey({
      projectId: req.apiKey.projectId,
      apiKeyId: req.params.id
    });

    if (!result) {
      return res.status(404).json({
        success: false,
        error: {
          code: "API_KEY_NOT_FOUND",
          message:
            "The API key was not found or has already been revoked."
        }
      });
    }

    return res.status(200).json({
      success: true,
      message:
        "API key rotated successfully. Save your new key securely.",
      data: {
        key: result.key,
        apiKey: result.apiKey,
        revokedApiKey: result.revokedApiKey
      }
    });
  } catch (error) {
    if (error instanceof TypeError) {
      return res.status(400).json({
        success: false,
        error: {
          code: "INVALID_API_KEY_ID",
          message: error.message
        }
      });
    }

    if (error.code === "API_KEY_EXPIRED") {
      return res.status(409).json({
        success: false,
        error: {
          code: "API_KEY_EXPIRED",
          message: error.message
        }
      });
    }

    next(error);
  }
});

// DELETE /api/v1/keys/:id
// Revoke a key only if it belongs to the authenticated project.
router.delete("/:id", async (req, res, next) => {
  try {
    const revokedKey = await revokeApiKey({
      projectId: req.apiKey.projectId,
      apiKeyId: req.params.id
    });

    if (!revokedKey) {
      return res.status(404).json({
        success: false,
        error: {
          code: "API_KEY_NOT_FOUND",
          message:
            "The API key was not found or has already been revoked."
        }
      });
    }

    res.status(200).json({
      success: true,
      message: "API key revoked successfully.",
      data: revokedKey
    });
  } catch (error) {
    if (error instanceof TypeError) {
      return res.status(400).json({
        success: false,
        error: {
          code: "INVALID_API_KEY_ID",
          message: error.message
        }
      });
    }

    next(error);
  }
});

export default router;

