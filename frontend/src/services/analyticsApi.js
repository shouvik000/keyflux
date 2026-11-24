import api from "./api";

export async function getAnalyticsDashboard(apiKey, days = 7) {
  if (!apiKey || !apiKey.trim()) {
    throw new Error("An API key is required to load analytics.");
  }

  const config = {
    headers: {
      "x-api-key": apiKey.trim()
    },
    params: {
      days
    }
  };

  const [
    overview,
    endpoints,
    timeline,
    performance,
    logs
  ] = await Promise.all([
    api.get("/analytics/overview", config),
    api.get("/analytics/endpoints", config),
    api.get("/analytics/timeline", config),
    api.get("/analytics/performance", config),
    api.get("/analytics/logs", {
      ...config,
      params: {
        days,
        page: 1,
        limit: 10
      }
    })
  ]);

  return {
    overview: overview.data.data,
    endpoints: endpoints.data.data,
    timeline: timeline.data.data,
    performance: performance.data.data,
    logs: logs.data.data
  };
}

export async function getAnalyticsLogs(
  apiKey,
  {
    days = 7,
    page = 1,
    limit = 10,
    method,
    statusCode
  } = {}
) {
  if (!apiKey || !apiKey.trim()) {
    throw new Error("An API key is required to load analytics.");
  }

  const params = {
    days,
    page,
    limit
  };

  if (method) params.method = method;
  if (statusCode) params.statusCode = statusCode;

  const response = await api.get("/analytics/logs", {
    headers: {
      "x-api-key": apiKey.trim()
    },
    params
  });

  return response.data.data;
}
