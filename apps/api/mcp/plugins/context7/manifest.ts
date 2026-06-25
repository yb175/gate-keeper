import "../../../src/utils/env.js";
import { StdioMCPServer } from "../../stdio-server.js";

const context7Env: Record<string, string> = {};
if (process.env.CONTEXT7_API_KEY) {
  context7Env["CONTEXT7_API_KEY"] = process.env.CONTEXT7_API_KEY;
}

export const context7Plugin = new StdioMCPServer(
  "context7",
  "npx",
  ["-y", "@upstash/context7-mcp"],
  context7Env,
);
