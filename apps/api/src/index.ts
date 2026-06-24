import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { formatDate } from "@repo/shared";
import { mcpDiscovery, mcpExecutor } from "../mcp/bootstrap.js";
import { AppError } from "../types.js";
import policiesRouter from "./policy/router.js";

dotenv.config();

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(policiesRouter);

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: formatDate(new Date()) });
});

// MCP Discovery endpoint
app.get("/mcp/tools", async (req, res) => {
  try {
    const forceRefresh = req.query.forceRefresh === "true";
    const toolsMap = await mcpDiscovery.discoverTools(forceRefresh);
    const toolsList = Array.from(toolsMap.entries()).map(([name, val]) => ({
      name,
      description: val.tool.description,
      inputSchema: val.tool.inputSchema,
      server: val.server.name,
    }));
    res.json({ tools: toolsList });
  } catch (error: any) {
    console.error("Failed to discover tools:", error);
    res.status(500).json({ error: "Failed to discover tools" });
  }
});

// MCP Execute endpoint
app.post("/mcp/execute", async (req, res) => {
  try {
    const { toolName, arguments: args, conversationId, decision } = req.body;

    // Sanitize timeoutMs parameter to prevent resource exhaustion / taint-flows
    let timeoutMs: number | undefined = undefined;
    if (req.body.timeoutMs !== undefined) {
      const parsed = Number(req.body.timeoutMs);
      if (!Number.isNaN(parsed) && parsed >= 1 && parsed <= 60000) {
        timeoutMs = parsed;
      }
    }

    const result = await mcpExecutor.execute(toolName, args, {
      conversationId,
      timeoutMs,
      decision,
    });
    res.json({ result });
  } catch (error: any) {
    console.error("Failed to execute tool:", error);

    if (error instanceof AppError) {
      res.status(error.statusCode).json({ error: error.message });
    } else {
      res.status(500).json({ error: "Failed to execute tool" });
    }
  }
});

app.listen(port, () => {
  console.log(`API server is running at http://localhost:${port}`);
});
