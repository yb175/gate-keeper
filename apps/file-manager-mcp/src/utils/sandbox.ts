import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const SANDBOX_ROOT = path.resolve(__dirname, "../../sandbox");

export function validatePath(filepath: string): string {
  if (!filepath) {
    throw new Error("Path is required");
  }

  let cleanPath = filepath;
  if (cleanPath.startsWith("sandbox/")) {
    cleanPath = cleanPath.substring("sandbox/".length);
  } else if (cleanPath.startsWith("sandbox\\")) {
    cleanPath = cleanPath.substring("sandbox\\".length);
  }

  const resolved = path.resolve(SANDBOX_ROOT, cleanPath);
  const relative = path.relative(SANDBOX_ROOT, resolved);

  const isEscaped = relative.startsWith("..") || path.isAbsolute(relative);

  if (isEscaped) {
    throw new Error(`Access denied: Path '${filepath}' escapes the sandbox.`);
  }

  return resolved;
}
