
import { createHash, randomBytes } from "node:crypto";

const API_KEY_PREFIX = "kf_live_";

export function generateApiKey() {
  const secret = randomBytes(32).toString("base64url");
  const fullKey = `${API_KEY_PREFIX}${secret}`;

  return {
    fullKey,
    keyPrefix: `${API_KEY_PREFIX}${secret.slice(0, 8)}`,
    keyHash: hashApiKey(fullKey)
  };
}

export function hashApiKey(apiKey) {
  if (typeof apiKey !== "string" || apiKey.length === 0) {
    throw new TypeError("API key must be a non-empty string.");
  }

  return createHash("sha256")
    .update(apiKey, "utf8")
    .digest("hex");
}
