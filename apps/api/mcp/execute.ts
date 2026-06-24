import { ToolsDiscovery } from "./discovery.js";
import { logger } from "./logger.js";

export interface ExecuteOptions {
  conversationId?: string;
  timeoutMs?: number;
  decision?: string;
}

export class ToolExecutor {
  constructor(private discovery: ToolsDiscovery) {}

  async execute(
    toolName: string,
    args: unknown,
    options?: ExecuteOptions,
  ): Promise<unknown> {
    const startTime = Date.now();
    const conversationId = options?.conversationId ?? "unknown";
    const decision = options?.decision ?? "ALLOW";

    // 1. Input Validation
    if (typeof toolName !== "string") {
      const error = new Error("Tool name must be a non-empty string");
      logger.error("Tool execution failed: Invalid input", {
        tool_name: "invalid_type",
        decision: "DENY",
        conversation_id: conversationId,
        duration_ms: 0,
        error_message: error.message,
      });
      throw error;
    }

    if (!toolName.trim()) {
      const error = new Error("Tool name cannot be empty");
      logger.error("Tool execution failed: Invalid input", {
        tool_name: "empty",
        decision: "DENY",
        conversation_id: conversationId,
        duration_ms: 0,
        error_message: error.message,
      });
      throw error;
    }

    try {
      // 2. Discover Tools (uses cache internally)
      const discovered = await this.discovery.discoverTools();
      const discoveredTool = discovered.get(toolName);

      if (!discoveredTool) {
        throw new Error(`Tool not found: ${toolName}`);
      }

      // 3. Execution Timeout Safeness
      let timeout = options?.timeoutMs ?? 10000;

      const MAX_TIMEOUT_MS = 60000; // 60 seconds max
      const MIN_TIMEOUT_MS = 1; // 1 ms min

      if (
        typeof timeout !== "number" ||
        Number.isNaN(timeout) ||
        timeout < MIN_TIMEOUT_MS
      ) {
        timeout = 10000;
      } else if (timeout > MAX_TIMEOUT_MS) {
        timeout = MAX_TIMEOUT_MS;
      }

      let timerId: NodeJS.Timeout | undefined;

      const timeoutPromise = new Promise<never>((_, reject) => {
        timerId = setTimeout(() => {
          reject(new Error(`Execution timed out after ${timeout}ms`));
        }, timeout);
        if (timerId && typeof timerId === "object" && "unref" in timerId) {
          timerId.unref();
        }
      });

      try {
        const result = await Promise.race([
          discoveredTool.server.execute(toolName, args),
          timeoutPromise,
        ]);

        const durationMs = Date.now() - startTime;
        logger.info("Tool executed successfully", {
          tool_name: toolName,
          decision,
          conversation_id: conversationId,
          duration_ms: durationMs,
          error_message: undefined,
        });

        return result;
      } finally {
        if (timerId) {
          clearTimeout(timerId);
        }
      }
    } catch (error: any) {
      const durationMs = Date.now() - startTime;
      const error_message = error?.message || String(error);

      logger.error("Tool execution failed", {
        tool_name: toolName,
        decision: options?.decision ?? "FAILED",
        conversation_id: conversationId,
        duration_ms: durationMs,
        error_message,
      });

      throw error;
    }
  }
}
