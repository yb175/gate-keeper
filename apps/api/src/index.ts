import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { formatDate } from "@repo/shared";
import { mcpDiscovery, mcpExecutor } from "../mcp/bootstrap.js";

dotenv.config();

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: "1mb" }));

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
    const errMsg = error?.message || "";
    console.error("Failed to execute tool:", error);

    if (errMsg.includes("must be a") || errMsg.includes("cannot be empty")) {
      res.status(400).json({ error: errMsg });
    } else if (errMsg.includes("Tool not found")) {
      res.status(404).json({ error: errMsg });
    } else if (errMsg.includes("rejected with decision")) {
      res.status(403).json({ error: errMsg });
    } else {
      res.status(500).json({ error: "Failed to execute tool" });
    }
  }
});

app.listen(port, () => {
  console.log(`API server is running at http://localhost:${port}`);
});
