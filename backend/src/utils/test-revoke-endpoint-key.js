
import pool from "../config/database.js";
import { revokeApiKey } from "../services/apiKeyService.js";

try {
  const revoked = await revokeApiKey({
    projectId: "3",
    apiKeyId: "3"
  });

  if (revoked) {
    console.log("Temporary API key revoked successfully.");
  } else {
    console.log("Key was already revoked or was not found.");
  }
} catch (error) {
  console.error("Revocation failed:", error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
