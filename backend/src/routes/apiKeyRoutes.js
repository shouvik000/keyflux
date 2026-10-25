
import { Router } from "express";
import { apiKeyAuth } from "../middleware/apiKeyAuth.js";
import { apiRateLimit } from "../middleware/apiRateLimit.js";
import usageLogger from "../middleware/usageLogger.js";

import {
  createApiKey,
  listApiKeys,
  revokeApiKey
} from "../services/apiKeyService.js";

const router = Router();

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
