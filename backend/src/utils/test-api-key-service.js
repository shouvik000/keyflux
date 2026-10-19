
import pool from "../config/database.js";
import {
  createApiKey,
  listApiKeys,
  revokeApiKey
} from "../services/apiKeyService.js";
import { randomUUID } from "node:crypto";

let testUserId;

async function runTest() {
  try {
    const email = `keyflux-test-${randomUUID()}@example.com`;

    const userResult = await pool.query(
      `INSERT INTO users (name, email, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [ "KeyFlux Test User", email, "test-only-placeholder" ]
    );

    testUserId = userResult.rows[0].id;

    const projectResult = await pool.query(
      `INSERT INTO projects (user_id, name, description)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [testUserId, "Temporary API Key Test", "Temporary test project"]
    );

    const projectId = projectResult.rows[0].id;

    const created = await createApiKey({
      projectId,
      name: "Test Key"
    });

    console.log("Create key:", created.apiKey.id ? "PASS" : "FAIL");
    console.log(
      "Key has expected prefix:",
      created.key.startsWith("kf_live_") ? "PASS" : "FAIL"
    );

    const listed = await listApiKeys(projectId);

    console.log(
      "List key:",
      listed.some((item) => item.id === created.apiKey.id)
        ? "PASS"
        : "FAIL"
    );

    console.log(
      "List excludes hash:",
      listed.every((item) => !("key_hash" in item))
        ? "PASS"
        : "FAIL"
    );

    const revoked = await revokeApiKey({
      projectId,
      apiKeyId: created.apiKey.id
    });

    console.log("Revoke key:", revoked ? "PASS" : "FAIL");

    const listedAgain = await listApiKeys(projectId);
    const revokedKey = listedAgain.find(
      (item) => item.id === created.apiKey.id
    );

    console.log(
      "Revoked timestamp saved:",
      revokedKey?.revoked_at ? "PASS" : "FAIL"
    );
  } finally {
    if (testUserId !== undefined) {
      await pool.query("DELETE FROM users WHERE id = $1", [testUserId]);
      console.log("Temporary test records cleaned up.");
    }
  }
}

runTest()
  .catch((error) => {
    console.error("API key service test failed:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
