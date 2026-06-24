import { Tool } from "../types.js";
import { validatePath } from "../utils/sandbox.js";
import * as fs from "fs/promises";
import * as path from "path";

export const moveFile: Tool = {
  name: "move_file",
  description: "Move or rename a file inside the sandbox",
  inputSchema: {
    type: "object",
    properties: {
      source: {
        type: "string",
        description: "The path of the source file to move"
      },
      destination: {
        type: "string",
        description: "The destination path to move the file to"
      }
    },
    required: ["source", "destination"]
  },
  async execute(args: { source: string; destination: string }): Promise<string> {
    if (!args || typeof args.source !== "string" || typeof args.destination !== "string") {
      throw new Error("Invalid arguments: 'source' and 'destination' must be strings");
    }
    const resolvedSource = validatePath(args.source);
    const resolvedDest = validatePath(args.destination);
    
    try {
      await fs.access(resolvedDest);
      throw new Error(`Destination file '${args.destination}' already exists.`);
    } catch (err: any) {
      if (err.code !== "ENOENT") {
        throw err;
      }
    }
    
    await fs.mkdir(path.dirname(resolvedDest), { recursive: true });
    await fs.rename(resolvedSource, resolvedDest);
    return "File moved successfully";
  }
};
