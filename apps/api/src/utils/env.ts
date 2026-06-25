import dotenv from "dotenv";
import path from "path";
import fs from "fs";

// Find and load .env by searching up the directory tree
let currentDir = process.cwd();
while (currentDir) {
  const envPath = path.join(currentDir, ".env");
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
    break;
  }
  const parent = path.dirname(currentDir);
  if (parent === currentDir) break;
  currentDir = parent;
}
