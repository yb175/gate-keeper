import { Tool } from "../types.js";
import { validatePath } from "../utils/sandbox.js";
import * as fs from "fs/promises";
import * as path from "path";

export const writeFile: Tool = {
  name: "write_file",
  description: "Write content to a file inside the sandbox",
  inputSchema: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "The path of the file to write to",
      },
      content: {
        type: "string",
        description: "The content to write",
      },
    },
    required: ["path", "content"],
  },
  async execute(args: { path: string; content: string }): Promise<string> {
    if (
      !args ||
      typeof args.path !== "string" ||
      typeof args.content !== "string"
    ) {
      throw new Error(
        "Invalid arguments: 'path' and 'content' must be strings",
      );
    }
    const resolvedPath = validatePath(args.path);
    await fs.mkdir(path.dirname(resolvedPath), { recursive: true });
    await fs.writeFile(resolvedPath, args.content, "utf-8");
    return "File written successfully";
  },
};
