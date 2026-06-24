import * as path from "path";
import * as fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const SANDBOX_ROOT = path.resolve(__dirname, "../../sandbox");
export const REAL_SANDBOX_ROOT = fs.existsSync(SANDBOX_ROOT) ? fs.realpathSync(SANDBOX_ROOT) : SANDBOX_ROOT;

function getRealPathSafe(p: string): string {
  try {
    return fs.realpathSync(p);
  } catch (err: any) {
    if (err.code === "ENOENT") {
      const parent = path.dirname(p);
      if (parent === p) {
        return p;
      }
      return getRealPathSafe(parent);
    }
    throw err;
  }
}

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

  const resolved = path.resolve(REAL_SANDBOX_ROOT, cleanPath);

  // 1. Fast syntactic check
  const relative = path.relative(REAL_SANDBOX_ROOT, resolved);
  if (relative.startsWith("..")) {
    throw new Error(`Access denied: Path '${filepath}' escapes the sandbox.`);
  }

  // 2. Resolve symlinks of closest existing ancestor to prevent traversal bypasses
  const realAncestor = getRealPathSafe(resolved);
  const realRelative = path.relative(REAL_SANDBOX_ROOT, realAncestor);
  if (realRelative.startsWith("..")) {
    throw new Error(`Access denied: Path '${filepath}' resolves outside the sandbox.`);
  }

  return resolved;
}

