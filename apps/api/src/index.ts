import "./utils/env.js";
import express from "express";
import cors from "cors";
import { formatDate } from "@repo/shared";
import { mcpDiscovery, mcpExecutor } from "../mcp/bootstrap.js";
import { AppError } from "../types.js";
import policiesRouter from "./policy/router.js";
import { runAgent } from "./agent/loop.js";
import { createMemory } from "./agent/memory.js";

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

// Agent execution endpoint
app.post("/agent/run", async (req, res) => {
  try {
    const { message, conversationId, approvalId, history } = req.body;

    if (!conversationId) {
      return res.status(400).json({ error: "conversationId is required" });
    }

    const memory = createMemory();
    if (Array.isArray(history)) {
      for (const msg of history) {
        memory.addMessage(msg.role, msg.content);
      }
    }

    const result = await runAgent(message, conversationId, undefined, {
      memory,
      approvalId,
    });

    res.json({
      status: result.status,
      answer: result.answer,
      approvalId: result.approvalId,
      reason: result.reason,
      history: result.memory.messages,
    });
  } catch (error: any) {
    console.error("Agent execution failed:", error);
    res.status(500).json({ error: error.message || "Agent execution failed" });
  }
});

app.listen(port, () => {
  console.log(`API server is running at http://localhost:${port}`);
});
