import { Tool } from "../types.js";
import { validatePath } from "../utils/sandbox.js";
import * as fs from "fs/promises";

export const deleteFile: Tool = {
  name: "delete_file",
  description: "Delete a file inside the sandbox",
  inputSchema: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "The path of the file to delete"
      }
    },
    required: ["path"]
  },
  async execute(args: { path: string }): Promise<string> {
    if (!args || typeof args.path !== "string") {
      throw new Error("Invalid arguments: 'path' must be a string");
    }
    const resolvedPath = validatePath(args.path);
    await fs.unlink(resolvedPath);
    return "File deleted successfully";
  }
};
