
import pool from "../config/database.js";

function validateProjectName(name) {
  if (typeof name !== "string" || !name.trim()) {
    const error = new Error("Project name is required.");
    error.code = "INVALID_INPUT";
    throw error;
  }

  const normalized = name.trim();

  if (normalized.length > 120) {
    const error = new Error("Project name cannot exceed 120 characters.");
    error.code = "INVALID_INPUT";
    throw error;
  }

  return normalized;
}

function validateDescription(description) {
  if (description === undefined || description === null) {
    return null;
  }

  if (typeof description !== "string") {
    const error = new Error("Description must be a string or null.");
    error.code = "INVALID_INPUT";
    throw error;
  }

  const normalized = description.trim();

  if (normalized.length > 10000) {
    const error = new Error("Description cannot exceed 10000 characters.");
    error.code = "INVALID_INPUT";
    throw error;
  }

  return normalized || null;
}

function validateProjectId(id) {
  if (!/^[1-9]\d*$/.test(String(id))) {
    const error = new Error("A valid project ID is required.");
    error.code = "INVALID_INPUT";
    throw error;
  }

  const parsed = Number(id);

  if (!Number.isSafeInteger(parsed)) {
    const error = new Error("A valid project ID is required.");
    error.code = "INVALID_INPUT";
    throw error;
  }

  return parsed;
}

export async function createProject(userId, data) {
  const name = validateProjectName(data?.name);
  const description = validateDescription(data?.description);

  try {
    const result = await pool.query(
      `INSERT INTO projects (user_id, name, description)
       VALUES ($1, $2, $3)
       RETURNING id, user_id, name, description, created_at, updated_at`,
      [userId, name, description]
    );

    return result.rows[0];
  } catch (error) {
    if (error.code === "23505") {
      const duplicateError = new Error(
        "You already have a project with this name."
      );
      duplicateError.code = "PROJECT_NAME_EXISTS";
      throw duplicateError;
    }

    throw error;
  }
}

export async function listProjects(userId) {
  const result = await pool.query(
    `SELECT id, user_id, name, description, created_at, updated_at
     FROM projects
     WHERE user_id = $1
     ORDER BY created_at DESC, id DESC`,
    [userId]
  );

  return result.rows;
}

export async function getProjectById(userId, projectId) {
  const id = validateProjectId(projectId);

  const result = await pool.query(
    `SELECT id, user_id, name, description, created_at, updated_at
     FROM projects
     WHERE id = $1 AND user_id = $2`,
    [id, userId]
  );

  return result.rows[0] ?? null;
}

export async function updateProject(userId, projectId, data) {
  const id = validateProjectId(projectId);

  if (!data || typeof data !== "object" || Array.isArray(data)) {
    const error = new Error("A JSON object with project fields is required.");
    error.code = "INVALID_INPUT";
    throw error;
  }

  const allowedFields = ["name", "description"];
  const providedFields = Object.keys(data);

  if (
    providedFields.length === 0 ||
    providedFields.some((field) => !allowedFields.includes(field))
  ) {
    const error = new Error(
      "Provide name and/or description; no other fields can be updated."
    );
    error.code = "INVALID_INPUT";
    throw error;
  }

  const updates = [];
  const values = [];
  let index = 1;

  if (Object.hasOwn(data, "name")) {
    updates.push(`name = $${index++}`);
    values.push(validateProjectName(data.name));
  }

  if (Object.hasOwn(data, "description")) {
    updates.push(`description = $${index++}`);
    values.push(validateDescription(data.description));
  }

  updates.push("updated_at = NOW()");

  values.push(id, userId);

  try {
    const result = await pool.query(
      `UPDATE projects
       SET ${updates.join(", ")}
       WHERE id = $${index++} AND user_id = $${index}
       RETURNING id, user_id, name, description, created_at, updated_at`,
      values
    );

    return result.rows[0] ?? null;
  } catch (error) {
    if (error.code === "23505") {
      const duplicateError = new Error(
        "You already have a project with this name."
      );
      duplicateError.code = "PROJECT_NAME_EXISTS";
      throw duplicateError;
    }

    throw error;
  }
}

export async function deleteProject(userId, projectId) {
  const id = validateProjectId(projectId);

  const result = await pool.query(
    `DELETE FROM projects
     WHERE id = $1 AND user_id = $2
     RETURNING id`,
    [id, userId]
  );

  return result.rowCount > 0;
}
