
import { Router } from "express";

import { apiKeyAuth } from "../middleware/apiKeyAuth.js";
import { apiRateLimit } from "../middleware/apiRateLimit.js";
import usageLogger from "../middleware/usageLogger.js";

import {
  getProjectAlerts,
  getProjectAlertById
} from "../services/alertService.js";

const router = Router();

const ALLOWED_ALERT_TYPES = [
  "RATE_LIMIT_WARNING",
  "RATE_LIMIT_EXCEEDED"
];

function validateAlertsQuery(req, res, next) {
  const rawPage = req.query.page ?? "1";
  const rawLimit = req.query.limit ?? "10";
  const rawAlertType = req.query.alertType;

  if (
    typeof rawPage !== "string" ||
    !/^[1-9]\d*$/.test(rawPage) ||
    !Number.isSafeInteger(Number(rawPage))
  ) {
    return res.status(400).json({
      success: false,
      error: {
        code: "INVALID_PAGE",
        message: "Page must be a positive integer."
      }
    });
  }

  if (
    typeof rawLimit !== "string" ||
    !/^[1-9]\d*$/.test(rawLimit) ||
    !Number.isSafeInteger(Number(rawLimit)) ||
    Number(rawLimit) > 100
  ) {
    return res.status(400).json({
      success: false,
      error: {
        code: "INVALID_LIMIT",
        message: "Limit must be between 1 and 100."
      }
    });
  }

  let alertType = null;

  if (rawAlertType !== undefined) {
    if (
      typeof rawAlertType !== "string" ||
      !ALLOWED_ALERT_TYPES.includes(rawAlertType)
    ) {
      return res.status(400).json({
        success: false,
        error: {
          code: "INVALID_ALERT_TYPE",
          message: "The supplied alert type is invalid."
        }
      });
    }

    alertType = rawAlertType;
  }

  req.alertFilters = {
    page: Number(rawPage),
    limit: Number(rawLimit),
    alertType
  };

  next();
}

function validateAlertId(req, res, next) {
  const { id } = req.params;

  if (
    typeof id !== "string" ||
    !/^[1-9]\d*$/.test(id) ||
    !Number.isSafeInteger(Number(id))
  ) {
    return res.status(400).json({
      success: false,
      error: {
        code: "INVALID_ALERT_ID",
        message: "Alert ID must be a positive integer."
      }
    });
  }

  req.alertId = Number(id);
  next();
}

router.use(apiKeyAuth, usageLogger, apiRateLimit);

// Get paginated project alerts.
router.get("/", validateAlertsQuery, async (req, res, next) => {
  try {
    const data = await getProjectAlerts(
      req.apiKey.projectId,
      req.alertFilters
    );

    res.status(200).json({
      success: true,
      data
    });
  } catch (error) {
    next(error);
  }
});

// Get a single alert belonging to the authenticated project.
router.get(
  "/:id",
  validateAlertId,
  async (req, res, next) => {
    try {
      const alert = await getProjectAlertById(
        req.apiKey.projectId,
        req.alertId
      );

      if (!alert) {
        return res.status(404).json({
          success: false,
          error: {
            code: "ALERT_NOT_FOUND",
            message: "Alert not found."
          }
        });
      }

      res.status(200).json({
        success: true,
        data: alert
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
