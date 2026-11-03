
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

/**
 * @swagger
 * components:
 *   schemas:
 *     AnalyticsError:
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
 *               example: INVALID_DAYS
 *             message:
 *               type: string
 *               example: The days parameter must be 7, 30, or 90.
 *
 *     RequestsByMethod:
 *       type: object
 *       properties:
 *         http_method:
 *           type: string
 *           example: GET
 *         total_requests:
 *           type: integer
 *           example: 120
 *
 *     AnalyticsOverview:
 *       type: object
 *       properties:
 *         total_requests:
 *           type: integer
 *           example: 500
 *         successful_requests:
 *           type: integer
 *           example: 450
 *         client_errors:
 *           type: integer
 *           example: 30
 *         server_errors:
 *           type: integer
 *           example: 20
 *         failed_requests:
 *           type: integer
 *           example: 50
 *         average_response_time_ms:
 *           type: number
 *           example: 45.25
 *         error_rate_percentage:
 *           type: number
 *           example: 10
 *         requests_by_method:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/RequestsByMethod'
 *
 *     EndpointAnalytics:
 *       type: object
 *       properties:
 *         request_path:
 *           type: string
 *           example: /api/v1/protected
 *         http_method:
 *           type: string
 *           example: GET
 *         total_requests:
 *           type: integer
 *           example: 100
 *         successful_requests:
 *           type: integer
 *           example: 90
 *         client_errors:
 *           type: integer
 *           example: 5
 *         server_errors:
 *           type: integer
 *           example: 5
 *         failed_requests:
 *           type: integer
 *           example: 10
 *         average_response_time_ms:
 *           type: number
 *           example: 42.5
 *
 *     TimelineAnalytics:
 *       type: object
 *       properties:
 *         date:
 *           type: string
 *           format: date
 *           example: "2026-11-03"
 *         total_requests:
 *           type: integer
 *           example: 100
 *         successful_requests:
 *           type: integer
 *           example: 90
 *         client_errors:
 *           type: integer
 *           example: 5
 *         server_errors:
 *           type: integer
 *           example: 5
 *         failed_requests:
 *           type: integer
 *           example: 10
 *
 *     AnalyticsLog:
 *       type: object
 *       properties:
 *         request_path:
 *           type: string
 *           example: /api/v1/protected
 *         http_method:
 *           type: string
 *           example: GET
 *         status_code:
 *           type: integer
 *           example: 200
 *         response_time_ms:
 *           type: integer
 *           example: 45
 *         created_at:
 *           type: string
 *           format: date-time
 *
 *     AnalyticsPagination:
 *       type: object
 *       properties:
 *         total:
 *           type: integer
 *           example: 150
 *         page:
 *           type: integer
 *           example: 1
 *         limit:
 *           type: integer
 *           example: 10
 *         totalPages:
 *           type: integer
 *           example: 15
 *         hasNextPage:
 *           type: boolean
 *           example: true
 *         hasPreviousPage:
 *           type: boolean
 *           example: false
 */

/**
 * @swagger
 * /api/v1/analytics/overview:
 *   get:
 *     summary: Get analytics overview
 *     description: Returns request statistics, success and error counts, average response time, error rate, and requests grouped by HTTP method.
 *     tags: [Analytics]
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: query
 *         name: days
 *         schema:
 *           type: integer
 *           enum: [7, 30, 90]
 *           default: 7
 *         description: Number of previous days to include.
 *     responses:
 *       200:
 *         description: Analytics overview retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 periodDays:
 *                   type: integer
 *                   example: 7
 *                 data:
 *                   $ref: '#/components/schemas/AnalyticsOverview'
 *       400:
 *         description: Invalid days parameter.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AnalyticsError'
 *       401:
 *         description: API key missing, invalid, revoked, or expired.
 *       429:
 *         description: API rate limit exceeded.
 *       500:
 *         description: Internal server error.
 *       503:
 *         description: Rate limiting service unavailable.
 *
 * /api/v1/analytics/endpoints:
 *   get:
 *     summary: Get endpoint analytics
 *     description: Returns analytics grouped by request path and HTTP method, limited to the top 20 results.
 *     tags: [Analytics]
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: query
 *         name: days
 *         schema:
 *           type: integer
 *           enum: [7, 30, 90]
 *           default: 7
 *         description: Number of previous days to include.
 *     responses:
 *       200:
 *         description: Endpoint analytics retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 periodDays:
 *                   type: integer
 *                   example: 7
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/EndpointAnalytics'
 *       400:
 *         description: Invalid days parameter.
 *       401:
 *         description: API key missing, invalid, revoked, or expired.
 *       429:
 *         description: API rate limit exceeded.
 *       500:
 *         description: Internal server error.
 *       503:
 *         description: Rate limiting service unavailable.
 *
 * /api/v1/analytics/timeline:
 *   get:
 *     summary: Get analytics timeline
 *     description: Returns daily request statistics for the selected period.
 *     tags: [Analytics]
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: query
 *         name: days
 *         schema:
 *           type: integer
 *           enum: [7, 30, 90]
 *           default: 7
 *         description: Number of previous days to include.
 *     responses:
 *       200:
 *         description: Analytics timeline retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 periodDays:
 *                   type: integer
 *                   example: 7
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/TimelineAnalytics'
 *       400:
 *         description: Invalid days parameter.
 *       401:
 *         description: API key missing, invalid, revoked, or expired.
 *       429:
 *         description: API rate limit exceeded.
 *       500:
 *         description: Internal server error.
 *       503:
 *         description: Rate limiting service unavailable.
 *
 * /api/v1/analytics/logs:
 *   get:
 *     summary: Get API usage logs
 *     description: Returns paginated API usage logs with optional HTTP method and status code filters.
 *     tags: [Analytics]
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: query
 *         name: days
 *         schema:
 *           type: integer
 *           enum: [7, 30, 90]
 *           default: 7
 *         description: Number of previous days to include.
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Page number.
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 10
 *         description: Number of logs per page.
 *       - in: query
 *         name: method
 *         schema:
 *           type: string
 *           enum: [GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS]
 *         description: Filter logs by HTTP method.
 *       - in: query
 *         name: statusCode
 *         schema:
 *           type: integer
 *           minimum: 100
 *           maximum: 599
 *         description: Filter logs by exact HTTP status code.
 *     responses:
 *       200:
 *         description: API usage logs retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 periodDays:
 *                   type: integer
 *                   example: 7
 *                 data:
 *                   type: object
 *                   properties:
 *                     logs:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/AnalyticsLog'
 *                     pagination:
 *                       $ref: '#/components/schemas/AnalyticsPagination'
 *       400:
 *         description: Invalid days, page, limit, method, or status code.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AnalyticsError'
 *       401:
 *         description: API key missing, invalid, revoked, or expired.
 *       429:
 *         description: API rate limit exceeded.
 *       500:
 *         description: Internal server error.
 *       503:
 *         description: Rate limiting service unavailable.
 */

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
