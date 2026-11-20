
import { Router } from "express";

import { apiKeyAuth } from "../middleware/apiKeyAuth.js";
import { apiRateLimit } from "../middleware/apiRateLimit.js";
import usageLogger from "../middleware/usageLogger.js";

import {
    createWebhook,
    listProjectWebhooks,
    getProjectWebhookById,
    updateProjectWebhook,
    deleteProjectWebhook
} from "../services/webhookService.js";

import {
    listWebhookDeliveries
} from "../services/webhookDeliveryService.js";



const router = Router();

function validateDeliveryPagination(req, res, next) {
    const limit = req.query.limit ?? "20";
    const offset = req.query.offset ?? "0";

    if (
        !/^\d+$/.test(String(limit)) ||
        !/^\d+$/.test(String(offset)) ||
        Number(limit) < 1 ||
        Number(limit) > 100 ||
        !Number.isSafeInteger(Number(offset))
    ) {
        return res.status(400).json({
            success: false,
            error: {
                code: "INVALID_PAGINATION",
                message: "Limit must be between 1 and 100, and offset must be a non-negative integer."
            }
        });
    }

    req.deliveryPagination = {
        limit: Number(limit),
        offset: Number(offset)
    };

    next();
}

const ALLOWED_EVENTS = [
    "RATE_LIMIT_WARNING",
    "RATE_LIMIT_EXCEEDED"
];

router.use(apiKeyAuth, usageLogger, apiRateLimit);

function validateWebhookId(req, res, next) {
    const { id } = req.params;

    if (
        typeof id !== "string" ||
        !/^[1-9]\d*$/.test(id) ||
        !Number.isSafeInteger(Number(id))
    ) {
        return res.status(400).json({
            success: false,
            error: {
                code: "INVALID_WEBHOOK_ID",
                message: "Webhook ID must be a positive integer."
            }
        });
    }

    req.webhookId = Number(id);
    next();
}

function validateWebhookBody(req, res, next) {
    const { name, url, events } = req.body ?? {};

    if (
        typeof name !== "string" ||
        name.trim().length < 1 ||
        name.trim().length > 100
    ) {
        return res.status(400).json({
            success: false,
            error: {
                code: "INVALID_WEBHOOK_NAME",
                message: "Webhook name must contain between 1 and 100 characters."
            }
        });
    }

    if (typeof url !== "string") {
        return res.status(400).json({
            success: false,
            error: {
                code: "INVALID_WEBHOOK_URL",
                message: "A valid HTTPS webhook URL is required."
            }
        });
    }

    if (
        !Array.isArray(events) ||
        events.length === 0 ||
        events.some((event) => !ALLOWED_EVENTS.includes(event)) ||
        new Set(events).size !== events.length
    ) {
        return res.status(400).json({
            success: false,
            error: {
                code: "INVALID_WEBHOOK_EVENTS",
                message: "Select one or more valid, unique webhook events."
            }
        });
    }

    next();
}

// Create a webhook.
router.post("/", validateWebhookBody, async (req, res, next) => {
    try {
        const result = await createWebhook({
            projectId: req.apiKey.projectId,
            name: req.body.name,
            url: req.body.url,
            events: req.body.events
        });

        res.status(201).json({
            success: true,
            data: result
        });
    } catch (error) {
        if (error instanceof TypeError) {
            return res.status(400).json({
                success: false,
                error: {
                    code: "INVALID_WEBHOOK",
                    message: error.message
                }
            });
        }

        next(error);
    }
});

// List project webhooks.
router.get("/", async (req, res, next) => {
    try {
        const webhooks = await listProjectWebhooks(
            req.apiKey.projectId
        );

        res.status(200).json({
            success: true,
            data: { webhooks }
        });
    } catch (error) {
        next(error);
    }
});

// List delivery history for a webhook.
router.get(
    "/:id/deliveries",
    validateWebhookId,
    validateDeliveryPagination,
    async (req, res, next) => {
        try {
            const deliveries = await listWebhookDeliveries({
                projectId: req.apiKey.projectId,
                webhookId: req.webhookId,
                limit: req.deliveryPagination.limit,
                offset: req.deliveryPagination.offset
            });

             if (deliveries === null) {
             return res.status(404).json({
              success: false,
            error: {
            code: "WEBHOOK_NOT_FOUND",
            message: "Webhook not found."
        }
    });
}
            res.status(200).json({
                success: true,
                data: {
                    deliveries,
                    pagination: {
                        limit: req.deliveryPagination.limit,
                        offset: req.deliveryPagination.offset,
                        count: deliveries.length
                    }
                }
            });
        } catch (error) {
            next(error);
        }
    }
);

// Get a single webhook.
router.get("/:id", validateWebhookId, async (req, res, next) => {
    try {
        const webhook = await getProjectWebhookById(
            req.apiKey.projectId,
            req.webhookId
        );

        if (!webhook) {
            return res.status(404).json({
                success: false,
                error: {
                    code: "WEBHOOK_NOT_FOUND",
                    message: "Webhook not found."
                }
            });
        }

        res.status(200).json({
            success: true,
            data: { webhook }
        });
    } catch (error) {
        next(error);
    }
});

// Update a webhook.
router.patch("/:id", validateWebhookId, async (req, res, next) => {
    try {
        const webhook = await updateProjectWebhook(
            req.apiKey.projectId,
            req.webhookId,
            req.body
        );

        if (!webhook) {
            return res.status(404).json({
                success: false,
                error: {
                    code: "WEBHOOK_NOT_FOUND",
                    message: "Webhook not found."
                }
            });
        }

        res.status(200).json({
            success: true,
            data: { webhook }
        });
    } catch (error) {
        if (error instanceof TypeError) {
            return res.status(400).json({
                success: false,
                error: {
                    code: "INVALID_WEBHOOK_UPDATE",
                    message: error.message
                }
            });
        }

        next(error);
    }
});

// Delete a webhook.
router.delete("/:id", validateWebhookId, async (req, res, next) => {
    try {
        const deleted = await deleteProjectWebhook(
            req.apiKey.projectId,
            req.webhookId
        );

        if (!deleted) {
            return res.status(404).json({
                success: false,
                error: {
                    code: "WEBHOOK_NOT_FOUND",
                    message: "Webhook not found."
                }
            });
        }

        res.status(200).json({
            success: true,
            message: "Webhook deleted successfully."
        });
    } catch (error) {
        next(error);
    }
});

export default router;
