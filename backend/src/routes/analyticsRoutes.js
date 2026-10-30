
import { Router } from "express";
import { apiKeyAuth } from "../middleware/apiKeyAuth.js";
import { apiRateLimit } from "../middleware/apiRateLimit.js";
import usageLogger from "../middleware/usageLogger.js";

import {
  getAnalyticsOverview,
  getAnalyticsEndpoints,
  getAnalyticsTimeline,
  getAnalyticsLogs
} from "../services/analyticsService.js";

const router = Router();

function validateDays(req, res, next) {
  const rawDays = req.query.days ?? "7";
  const days = Number(rawDays);

  if (
    typeof rawDays !== "string" ||
    !/^\d+$/.test(rawDays) ||
    ![7, 30, 90].includes(days)
  ) {
    return res.status(400).json({
      success: false,
      error: {
        code: "INVALID_DAYS",
        message: "The days parameter must be 7, 30, or 90."
      }
    });
  }

  req.analyticsDays = days;
  next();
}

function validateLogsQuery(req, res, next) {
  const rawPage = req.query.page ?? "1";
  const rawLimit = req.query.limit ?? "10";
  const rawMethod = req.query.method;
  const rawStatusCode = req.query.statusCode;

  if (
    typeof rawPage !== "string" ||
    !/^[1-9]\d*$/.test(rawPage)
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

  const page = Number(rawPage);
  const limit = Number(rawLimit);

  const allowedMethods = [
    "GET",
    "POST",
    "PUT",
    "PATCH",
    "DELETE",
    "HEAD",
    "OPTIONS"
  ];

  let method = null;

  if (rawMethod !== undefined) {
    if (
      typeof rawMethod !== "string" ||
      !allowedMethods.includes(rawMethod.toUpperCase())
    ) {
      return res.status(400).json({
        success: false,
        error: {
          code: "INVALID_METHOD",
          message: "The supplied HTTP method is invalid."
        }
      });
    }

    method = rawMethod.toUpperCase();
  }

  let statusCode = null;

  if (rawStatusCode !== undefined) {
    if (
      typeof rawStatusCode !== "string" ||
      !/^\d{3}$/.test(rawStatusCode) ||
      Number(rawStatusCode) < 100 ||
      Number(rawStatusCode) > 599
    ) {
      return res.status(400).json({
        success: false,
        error: {
          code: "INVALID_STATUS_CODE",
          message: "Status code must be between 100 and 599."
        }
      });
    }

    statusCode = Number(rawStatusCode);
  }

  req.analyticsLogFilters = {
    page,
    limit,
    method,
    statusCode
  };

  next();
}

router.use(apiKeyAuth, usageLogger, apiRateLimit);

router.get("/overview", validateDays, async (req, res, next) => {
  try {
    const data = await getAnalyticsOverview(
      req.apiKey.projectId,
      req.analyticsDays
    );

    res.status(200).json({
      success: true,
      periodDays: req.analyticsDays,
      data
    });
  } catch (error) {
    next(error);
  }
});

router.get("/endpoints", validateDays, async (req, res, next) => {
  try {
    const data = await getAnalyticsEndpoints(
      req.apiKey.projectId,
      req.analyticsDays
    );

    res.status(200).json({
      success: true,
      periodDays: req.analyticsDays,
      data
    });
  } catch (error) {
    next(error);
  }
});

router.get("/timeline", validateDays, async (req, res, next) => {
  try {
    const data = await getAnalyticsTimeline(
      req.apiKey.projectId,
      req.analyticsDays
    );

    res.status(200).json({
      success: true,
      periodDays: req.analyticsDays,
      data
    });
  } catch (error) {
    next(error);
  }
});

router.get(
  "/logs",
  validateDays,
  validateLogsQuery,
  async (req, res, next) => {
    try {
      const data = await getAnalyticsLogs(
        req.apiKey.projectId,
        {
          days: req.analyticsDays,
          ...req.analyticsLogFilters
        }
      );

      res.status(200).json({
        success: true,
        periodDays: req.analyticsDays,
        data
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;

