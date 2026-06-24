import { Tool } from "../types.js";
import { validatePath } from "../utils/sandbox.js";
import * as fs from "fs/promises";

export const readFile: Tool = {
  name: "read_file",
  description: "Read a file's content inside the sandbox",
  inputSchema: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "The path of the file to read"
      }
    },
    required: ["path"]
  },
  async execute(args: { path: string }): Promise<string> {
    if (!args || typeof args.path !== "string") {
      throw new Error("Invalid arguments: 'path' must be a string");
    }
    const resolvedPath = validatePath(args.path);
    return await fs.readFile(resolvedPath, "utf-8");
  }
};
