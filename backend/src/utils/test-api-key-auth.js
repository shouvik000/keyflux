
import express from "express";
import request from "supertest";
import pool from "../config/database.js";
import { apiKeyAuth } from "../middleware/apiKeyAuth.js";
import {
  createApiKey,
  revokeApiKey
} from "../services/apiKeyService.js";

const app = express();

app.get("/protected", apiKeyAuth, (req, res) => {
  res.json({
    success: true,
    projectId: req.apiKey.projectId
  });
});

async function runTests() {
  let userId;
  let projectId;

  try {
    const user = await pool.query(
      `INSERT INTO users (name, email, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [
        "API Auth Test User",
        `api-auth-test-${Date.now()}@example.com`,
        "test-only-password-hash"
      ]
    );

    userId = user.rows[0].id;

    const project = await pool.query(
      `INSERT INTO projects (user_id, name, description)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [userId, "API Auth Test Project", "Temporary test project"]
    );

    projectId = project.rows[0].id;

    const created = await createApiKey({
      projectId,
      name: "Authentication Test Key"
    });

    console.log("Test key created.");

    // Test 1: Missing key
    const missing = await request(app).get("/protected");
    console.assert(missing.status === 401, "FAIL: missing key");
    if (missing.status === 401) console.log("Missing key: PASS");

    // Test 2: Invalid key
    const invalid = await request(app)
      .get("/protected")
      .set("x-api-key", "kf_live_invalid_test_key");

    console.assert(invalid.status === 401, "FAIL: invalid key");
    if (invalid.status === 401) console.log("Invalid key: PASS");

    // Test 3: Valid key
    const valid = await request(app)
      .get("/protected")
      .set("x-api-key", created.key);

    console.assert(valid.status === 200, "FAIL: valid key");
    if (valid.status === 200) console.log("Valid key: PASS");

    console.assert(
      String(valid.body.projectId) === String(projectId),
      "FAIL: project ID mismatch"
    );

    if (String(valid.body.projectId) === String(projectId)) {
      console.log("Project identification: PASS");
    }

    // Test 4: last_used_at
    const usage = await pool.query(
      "SELECT last_used_at FROM api_keys WHERE id = $1",
      [created.apiKey.id]
    );

    console.assert(
      usage.rows[0]?.last_used_at != null,
      "FAIL: last_used_at was not updated"
    );

    if (usage.rows[0]?.last_used_at != null) {
      console.log("Last-used timestamp: PASS");
    }

    // Test 5: Revoked key
    await revokeApiKey({
      projectId,
      apiKeyId: created.apiKey.id
    });

    const revoked = await request(app)
      .get("/protected")
      .set("x-api-key", created.key);

    console.assert(revoked.status === 401, "FAIL: revoked key");
    if (revoked.status === 401) console.log("Revoked key: PASS");

    console.log("Middleware test run completed.");
  } finally {
    if (userId != null) {
      await pool.query("DELETE FROM users WHERE id = $1", [userId]);
      console.log("Temporary test records cleaned up.");
    }

    await pool.end();
  }
}

runTests().catch((error) => {
  console.error("Middleware test failed:", error);
  process.exitCode = 1;
});
