
import "../config/env.js";
import pool from "../config/database.js";
import { readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(currentDir, "migrations");

async function runMigrations() {
  const client = await pool.connect();

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        migration_name VARCHAR(255) PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // Find all SQL migration files and execute them alphabetically.
    const migrationFiles = (await readdir(migrationsDir))
      .filter((file) => file.endsWith(".sql"))
      .sort();

    for (const migrationName of migrationFiles) {
      const existing = await client.query(
        "SELECT migration_name FROM schema_migrations WHERE migration_name = $1",
        [migrationName]
      );

      if (existing.rowCount > 0) {
        console.log(`Migration already applied: ${migrationName}`);
        continue;
      }

      const migrationPath = join(migrationsDir, migrationName);
      const sql = await readFile(migrationPath, "utf8");

      await client.query("BEGIN");

      try {
        await client.query(sql);

        await client.query(
          "INSERT INTO schema_migrations (migration_name) VALUES ($1)",
          [migrationName]
        );

        await client.query("COMMIT");

        console.log(`Migration applied successfully: ${migrationName}`);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }

    console.log("Database migrations completed.");
  } finally {
    client.release();
  }
}

runMigrations()
  .catch((error) => {
    console.error("Database migration failed:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
