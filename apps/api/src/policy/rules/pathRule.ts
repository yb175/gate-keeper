import * as nodePath from "path";
import * as fs from "fs";
import { db } from "@repo/db";
import type { RuleResult } from "../../../types.js";
import { logger } from "../../../mcp/logger.js";

/**
 * Resolves the real path of the closest existing ancestor of `p`.
 *
 * This is the same algorithm used by the file-manager-mcp sandbox utility:
 * walk up the directory tree until we find a path that exists on disk, then
 * call `fs.realpathSync` on that ancestor to canonicalise symlinks.  We then
 * re-append the remaining suffix so the result still points at the requested
 * location, even if it does not exist yet (e.g. a new file about to be written).
 */
function getRealAncestor(p: string): string {
  try {
    return fs.realpathSync(p);
  } catch (err: any) {
    if (err.code === "ENOENT") {
      const parent = nodePath.dirname(p);
      // Guard against infinite recursion at filesystem root
      if (parent === p) {
        return p;
      }
      return nodePath.join(getRealAncestor(parent), nodePath.basename(p));
    }
    throw err;
  }
}

/**
 * Resolves the real (symlink-free) absolute path for a configured sandbox root.
 *
 * When the sandbox directory does not yet exist (e.g. on first boot), we
 * resolve the real path of the closest existing ancestor instead so the check
 * still works correctly.
 */
function resolveSandboxRoot(rawRoot: string): string {
  if (fs.existsSync(rawRoot)) {
    return fs.realpathSync(rawRoot);
  }
  const parent = nodePath.dirname(rawRoot);
  const canonicalParent = fs.existsSync(parent)
    ? fs.realpathSync(parent)
    : parent;
  return nodePath.resolve(canonicalParent, nodePath.basename(rawRoot));
}

/**
 * Checks whether every path-like argument in the tool call stays within the
 * `sandbox_path` configured on the policy record.
 *
 * Edge cases handled (mirrors file-manager-mcp/src/utils/sandbox.ts):
 *
 * 1. No `sandbox_path` on the policy → rule is skipped (returns allowed).
 * 2. Empty string path argument → DENY (same as the MCP "Path is required" guard).
 * 3. Argument prefixed with the sandbox directory name → strip the prefix
 *    before resolving (matches the "sandbox/" strip in validatePath).
 * 4. Syntactic traversal (`../`) → caught by `path.relative` starting with "..".
 * 5. Absolute path arguments that escape the root → caught by `path.isAbsolute(relative)`.
 * 6. Symlink traversal → real ancestor of the resolved path is checked against
 *    the real sandbox root, so a symlink inside the sandbox pointing outside
 *    it is still caught.
 * 7. Sandbox root that is itself a symlink → we resolve it with
 *    `resolveSandboxRoot` (matching the REAL_SANDBOX_ROOT logic in sandbox.ts).
 * 8. DB errors → fail-closed: success:false so the engine denies execution.
 *
 * @param tool_name   The tool being evaluated.
 * @param args        The raw arguments map from the agent step.
 * @param preFetchedPolicy  Optional pre-fetched policy object (avoids a second DB
 *                          round-trip when the engine already queried it).
 */
export default async function withinSandboxPath(
  tool_name: string,
  args: Record<string, unknown>,
  preFetchedPolicy?: any,
): Promise<RuleResult<boolean>> {
  try {
    const policy =
      preFetchedPolicy !== undefined
        ? preFetchedPolicy
        : await db.policy.findUnique({ where: { tool_name } });

    // No sandbox_path configured → this rule does not apply
    if (!policy?.sandbox_path) {
      return { success: true, result: false };
    }

    const rawRoot: string = policy.sandbox_path;

    // Resolve the real sandbox root (handles the root being a symlink itself)
    const sandboxRoot = resolveSandboxRoot(rawRoot);

    // Inspect argument keys that carry file-system paths.
    // To prevent failing open on new tools, we match any key containing path-like
    // terms (like filePath or targetPath), while excluding content fields (like
    // fileContent or text) to prevent false positives on legitimate content.
    const isPathKey = (key: string): boolean => {
      const normalized = key.toLowerCase();
      const exclusions = ["content", "text", "message", "body", "data", "code", "arguments", "args"];
      if (exclusions.some(exc => normalized.includes(exc))) {
        return false;
      }
      const pathKeywords = ["path", "file", "dir", "folder", "src", "dest", "source", "destination"];
      return pathKeywords.some(keyword => normalized.includes(keyword));
    };

    const pathArgs = Object.entries(args)
      .filter(([k, v]) => isPathKey(k) && typeof v === "string")
      .map(([k, v]) => ({ key: k, value: v as string }));

    // If the tool takes no string arguments, there is nothing to check
    if (pathArgs.length === 0) {
      return { success: true, result: false };
    }

    const sandboxBasename = nodePath.basename(rawRoot);

    for (const { key, value } of pathArgs) {
      // Edge-case 2: empty path argument
      if (!value) {
        logger.warn("Path argument is empty in pathRule", { tool_name, key });
        return {
          success: true,
          result: true,
          reason: `Path argument '${key}' must not be empty`,
        };
      }

      // Edge-case 3: strip leading "sandbox/" or "<basename>/" prefixes so
      // agents using relative paths with the sandbox name still resolve correctly.
      let cleanValue = value;
      const prefixSlash = sandboxBasename + "/";
      const prefixBackslash = sandboxBasename + "\\";
      if (cleanValue.startsWith(prefixSlash)) {
        cleanValue = cleanValue.substring(prefixSlash.length);
      } else if (cleanValue.startsWith(prefixBackslash)) {
        cleanValue = cleanValue.substring(prefixBackslash.length);
      }

      // Resolve against the real sandbox root
      const resolved = nodePath.resolve(sandboxRoot, cleanValue);

      // Edge-case 4 & 5: syntactic check — catches traversal and absolute
      // paths that land outside the sandbox without touching the filesystem.
      // Use exact segment boundaries to avoid false-positives on names like "..foo":
      // a path escapes if any segment is exactly "..".
      const relative = nodePath.relative(sandboxRoot, resolved);
      const escapesViaDotDot = relative.split(nodePath.sep).some(seg => seg === "..");
      if (escapesViaDotDot || nodePath.isAbsolute(relative)) {
        logger.warn("Path argument escapes sandbox (syntactic check)", {
          tool_name,
          key,
          value,
          sandbox_path: rawRoot,
        });
        return {
          success: true,
          result: true,
          reason: `Path argument '${key}' escapes the configured sandbox: ${rawRoot}`,
        };
      }

      // Edge-case 6: symlink traversal — resolve real ancestor and re-check
      const realResolved = getRealAncestor(resolved);
      const realRelative = nodePath.relative(sandboxRoot, realResolved);
      const realEscapesViaDotDot = realRelative.split(nodePath.sep).some(seg => seg === "..");
      if (realEscapesViaDotDot || nodePath.isAbsolute(realRelative)) {
        logger.warn("Path argument escapes sandbox via symlink (real path check)", {
          tool_name,
          key,
          value,
          realResolved,
          sandbox_path: rawRoot,
        });
        return {
          success: true,
          result: true,
          reason: `Path argument '${key}' escapes the configured sandbox: ${rawRoot}`,
        };
      }
    }

    // All path arguments are within the sandbox
    return { success: true, result: false };
  } catch (error: any) {
    logger.error("Database or filesystem error in withinSandboxPath rule", {
      tool_name,
      error_message: error instanceof Error ? error.message : String(error),
    });

    return {
      success: false,
      result: false,
      reason: "Failed to evaluate path sandbox rule",
    };
  }
}
