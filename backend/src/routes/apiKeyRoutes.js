
import { Router } from "express";

import { apiKeyAuth } from "../middleware/apiKeyAuth.js";
import { apiRateLimit } from "../middleware/apiRateLimit.js";
import usageLogger from "../middleware/usageLogger.js";

import {
  createApiKey,
  listApiKeys,
  revokeApiKey,
  getApiKeyUsage
} from "../services/apiKeyService.js";

const router = Router();

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
 *     description: Returns API keys belonging to the project associated with the supplied API key.
 *     tags: [API Keys]
 *     security:
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: API keys retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/ApiKey'
 *       401:
 *         description: API key missing, invalid, revoked, or expired.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiKeyError'
 *       500:
 *         description: Internal server error.
 *
 *   post:
 *     summary: Create an API key
 *     description: Creates a new API key for the authenticated project. The full key is returned only once.
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
 *         description: API key created successfully. Save the full key because it will not be shown again.
 *       400:
 *         description: Invalid API key input.
 *       401:
 *         description: API key missing, invalid, revoked, or expired.
 *       500:
 *         description: Internal server error.
 *
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
    const data = await listApiKeys(req.apiKey.projectId);

    res.status(200).json({
      success: true,
      data
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/v1/keys
// Create a new key for the authenticated project.
router.post("/", async (req, res, next) => {
  try {
    const { name, expiresAt = null } = req.body ?? {};

    const result = await createApiKey({
      projectId: req.apiKey.projectId,
      name,
      expiresAt
    });

    res.status(201).json({
      success: true,
      message: "API key created successfully. Save the key now; it will not be shown again.",
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
      message: "The API key was not found in the authenticated project."
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
          message: "The API key was not found or has already been revoked."
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

