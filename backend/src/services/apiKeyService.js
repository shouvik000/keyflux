
import pool from "../config/database.js";
import { generateApiKey } from "../utils/apiKey.js";

function validateId(value, fieldName) {
  const id = String(value ?? "");

  if (!/^[1-9]\d*$/.test(id)) {
    throw new TypeError(`${fieldName} must be a positive integer.`);
  }

  return id;
}

function validateName(name) {
  if (typeof name !== "string" || !name.trim()) {
    throw new TypeError("API key name is required.");
  }

  const cleanName = name.trim();

  if (cleanName.length > 100) {
    throw new TypeError("API key name cannot exceed 100 characters.");
  }

  return cleanName;
}

function validateExpiration(expiresAt) {
  if (expiresAt == null || expiresAt === "") {
    return null;
  }

  const date = new Date(expiresAt);

  if (Number.isNaN(date.getTime())) {
    throw new TypeError("expiresAt must be a valid date.");
  }

  if (date.getTime() <= Date.now()) {
    throw new TypeError("expiresAt must be in the future.");
  }

  return date.toISOString();
}

export async function createApiKey({
  projectId,
  name,
  expiresAt = null
}) {
  const validProjectId = validateId(projectId, "projectId");
  const validName = validateName(name);
  const validExpiration = validateExpiration(expiresAt);

  const generated = generateApiKey();

  const result = await pool.query(
    `INSERT INTO api_keys
       (project_id, name, key_prefix, key_hash, expires_at)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, project_id, name, key_prefix, expires_at, created_at`,
    [
      validProjectId,
      validName,
      generated.keyPrefix,
      generated.keyHash,
      validExpiration
    ]
  );

  return {
    key: generated.fullKey,
    apiKey: result.rows[0]
  };
}

export async function listApiKeys(projectId) {
  const validProjectId = validateId(projectId, "projectId");

  const result = await pool.query(
    `SELECT
       id,
       project_id,
       name,
       key_prefix,
       last_used_at,
       expires_at,
       revoked_at,
       created_at
     FROM api_keys
     WHERE project_id = $1
     ORDER BY created_at DESC`,
    [validProjectId]
  );

  return result.rows;
}

export async function revokeApiKey({ projectId, apiKeyId }) {
  const validProjectId = validateId(projectId, "projectId");
  const validApiKeyId = validateId(apiKeyId, "apiKeyId");

  const result = await pool.query(
    `UPDATE api_keys
     SET revoked_at = NOW()
     WHERE id = $1
       AND project_id = $2
       AND revoked_at IS NULL
     RETURNING id, project_id, revoked_at`,
    [validApiKeyId, validProjectId]
  );

  return result.rows[0] ?? null;
}
