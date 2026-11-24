import api from "./api";

export async function getProjectAlerts(apiKey, {
  page = 1,
  limit = 10,
  alertType
} = {}) {
  if (!apiKey || !apiKey.trim()) {
    throw new Error("An API key is required to load alerts.");
  }

  const params = { page, limit };

  if (alertType) {
    params.alertType = alertType;
  }

  const response = await api.get("/alerts", {
    headers: {
      "x-api-key": apiKey.trim()
    },
    params
  });

  return response.data.data;
}

export async function getProjectAlertById(apiKey, alertId) {
  if (!apiKey || !apiKey.trim()) {
    throw new Error("An API key is required to load alert details.");
  }

  if (!Number.isSafeInteger(Number(alertId)) || Number(alertId) < 1) {
    throw new Error("A valid alert ID is required.");
  }

  const response = await api.get(`/alerts/${alertId}`, {
    headers: {
      "x-api-key": apiKey.trim()
    }
  });

  return response.data.data;
}
