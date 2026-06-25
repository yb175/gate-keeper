import dotenv from "dotenv";
import path from "path";
import fs from "fs";

// Find and load .env by searching up the directory tree
let currentDir = process.cwd();
while (currentDir) {
  const envPath = path.join(currentDir, ".env");
  if (fs.existsSync(envPath)) {
    const result = dotenv.config({ path: envPath });
    if (result.error) {
      throw new Error(`Failed to load/parse env file at ${envPath}: ${result.error.message}`);
    }
    break;
  }
  // Stop traversing if we hit the monorepo root (contains turbo.json)
  if (fs.existsSync(path.join(currentDir, "turbo.json"))) {
    break;
  }
  const parent = path.dirname(currentDir);
  if (parent === currentDir) break;
  currentDir = parent;
}
