import "../../../src/utils/env.js";
import { StdioMCPServer } from "../../stdio-server.js";

export const puppeteerPlugin = new StdioMCPServer(
  "puppeteer",
  "npx",
  ["-y", "@modelcontextprotocol/server-puppeteer"],
  {},
);
