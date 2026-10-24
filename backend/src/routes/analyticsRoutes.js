
import { Router } from "express";
import { apiKeyAuth } from "../middleware/apiKeyAuth.js";
import { apiRateLimit } from "../middleware/apiRateLimit.js";
import usageLogger from "../middleware/usageLogger.js";

import {
  getAnalyticsOverview,
  getAnalyticsEndpoints,
  getAnalyticsTimeline
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

export default router;
