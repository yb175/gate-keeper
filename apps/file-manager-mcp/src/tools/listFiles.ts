import { Tool } from "../types.js";
import { SANDBOX_ROOT } from "../utils/sandbox.js";
import * as fs from "fs/promises";
import * as path from "path";

async function getFilesRecursively(dir: string, baseDir: string): Promise<string[]> {
  let results: string[] = [];
  let list;
  try {
    list = await fs.readdir(dir, { withFileTypes: true });
  } catch (err: any) {
    if (err.code === "ENOENT") {
      return [];
    }
    throw err;
  }

  for (const entry of list) {
    const res = path.resolve(dir, entry.name);
    if (entry.isDirectory()) {
      results = results.concat(await getFilesRecursively(res, baseDir));
    } else {
      const relPath = path.relative(baseDir, res).replace(/\\/g, "/");
      results.push(relPath);
    }
  }
  return results;
}

export const listFiles: Tool = {
  name: "list_files",
  description: "List all files in the sandbox",
  inputSchema: {
    type: "object",
    properties: {}
  },
  async execute(args: any): Promise<string[]> {
    await fs.mkdir(SANDBOX_ROOT, { recursive: true });
    const files = await getFilesRecursively(SANDBOX_ROOT, SANDBOX_ROOT);
    return files.sort();
  }
};
