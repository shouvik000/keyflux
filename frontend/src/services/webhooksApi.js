
import api from "./api";

function validateApiKey(apiKey) {
  if (!apiKey || !apiKey.trim()) {
    throw new Error("An API key is required.");
  }
}

function validateId(id, label = "ID") {
  if (!Number.isSafeInteger(Number(id)) || Number(id) < 1) {
    throw new Error(`A valid ${label} is required.`);
  }
}

function getConfig(apiKey, extra = {}) {
  validateApiKey(apiKey);

  return {
    ...extra,
    headers: {
      ...extra.headers,
      "x-api-key": apiKey.trim()
    }
  };
}

export async function getProjectWebhooks(apiKey) {
  const response = await api.get(
    "/webhooks",
    getConfig(apiKey)
  );

  return response.data.data.webhooks;
}

export async function createProjectWebhook(
  apiKey,
  { name, url, events }
) {
  validateApiKey(apiKey);

  if (!name?.trim()) {
    throw new Error("Webhook name is required.");
  }

  if (!url?.trim()) {
    throw new Error("Webhook URL is required.");
  }

  if (!Array.isArray(events) || events.length === 0) {
    throw new Error("Select at least one webhook event.");
  }

  const response = await api.post(
    "/webhooks",
    {
      name: name.trim(),
      url: url.trim(),
      events
    },
    getConfig(apiKey)
  );

  return response.data.data;
}

export async function updateProjectWebhook(
  apiKey,
  webhookId,
  updates
) {
  validateApiKey(apiKey);
  validateId(webhookId, "webhook ID");

  const response = await api.patch(
    `/webhooks/${webhookId}`,
    updates,
    getConfig(apiKey)
  );

  return response.data.data.webhook;
}

export async function deleteProjectWebhook(apiKey, webhookId) {
  validateApiKey(apiKey);
  validateId(webhookId, "webhook ID");

  const response = await api.delete(
    `/webhooks/${webhookId}`,
    getConfig(apiKey)
  );

  return response.data;
}

export async function getWebhookDeliveries(
  apiKey,
  webhookId,
  { limit = 20, offset = 0 } = {}
) {
  validateApiKey(apiKey);
  validateId(webhookId, "webhook ID");

  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("Limit must be between 1 and 100.");
  }

  if (!Number.isInteger(offset) || offset < 0) {
    throw new Error("Offset must be zero or greater.");
  }

  const response = await api.get(
    `/webhooks/${webhookId}/deliveries`,
    getConfig(apiKey, {
      params: { limit, offset }
    })
  );

  return response.data.data;
}

export async function retryWebhookDelivery(
  apiKey,
  webhookId,
  deliveryId
) {
  validateApiKey(apiKey);
  validateId(webhookId, "webhook ID");
  validateId(deliveryId, "delivery ID");

  const response = await api.post(
    `/webhooks/${webhookId}/deliveries/${deliveryId}/retry`,
    {},
    getConfig(apiKey)
  );

  return response.data.data;
}
