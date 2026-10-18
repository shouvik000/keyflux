
import dotenv from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = dirname(fileURLToPath(import.meta.url));
const rootEnvPath = resolve(currentDir, "../../../.env");

const result = dotenv.config({ path: rootEnvPath });

if (result.error) {
  throw new Error(`Unable to load root .env file: ${result.error.message}`);
}
