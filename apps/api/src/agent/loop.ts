import { db } from "@repo/db";
import { createMemory } from "./memory.js";
import { nextStep } from "./llm.js";
import { decide } from "../policy/decision.js";
import { mcpDiscovery, mcpExecutor } from "../../mcp/bootstrap.js";
import { logger } from "../../mcp/logger.js";
import { Memory, AgentStep, AgentResult, Tool } from "../../types.js";

export async function runAgent(
  userMessage: string | null,
  conversationId: string,
  options?: {
    memory?: Memory;
    approvalId?: string;
  }
): Promise<AgentResult> {
  // Ensure conversation exists in DB before execution to prevent record missing errors during manual testing
  let conversation = await db.conversation.upsert({
    where: { id: conversationId },
    update: {},
    create: {
      id: conversationId,
      budget_limit: 20000,
      tokens_used: 0,
    },
  });

  // Automatically reset the token budget if 3 minutes (180,000 ms) have passed since budget_reset_at
  const threeMinutes = 3 * 60 * 1000;
  const elapsed = Date.now() - new Date(conversation.budget_reset_at).getTime();
  if (elapsed > threeMinutes) {
    logger.info("Resetting conversation budget limit (3-minute window expired)", { conversation_id: conversationId });
    conversation = await db.conversation.update({
      where: { id: conversationId },
      data: {
        tokens_used: 0,
        budget_reset_at: new Date(),
      },
    });
  }

  logger.info("Agent run started", { conversation_id: conversationId, is_resume: !!options?.approvalId });

  const memory = options?.memory || createMemory();
  if (userMessage) {
    memory.addMessage("user", userMessage);
  }

  let activeApprovalId = options?.approvalId;
  let accumulatedTokens = 0;

  // Retrieve tools list from MCP discovery map
  const toolsMap = await mcpDiscovery.discoverTools();
  const tools: Tool[] = Array.from(toolsMap.values()).map(vt => vt.tool);

  // Helper to persist accumulated tokens to the database
  const updateTokens = async () => {
    if (accumulatedTokens > 0) {
      logger.info("Persisting agent tokens", { conversation_id: conversationId, tokens: accumulatedTokens });
      await db.conversation.update({
        where: { id: conversationId },
        data: {
          tokens_used: {
            increment: accumulatedTokens,
          },
        },
      });
    }
  };

  let iterations = 0;
  try {
    while (true) {
      iterations++;
      if (iterations > 30) {
        throw new Error("Agent loop iteration limit exceeded");
      }
      let step: AgentStep;

      if (activeApprovalId) {
        // Fetch approval request to resume execution
        const approval = await db.approval.findUnique({
          where: { id: activeApprovalId }
        });
        if (!approval) {
          logger.warn("Resumed approval record not found", { conversation_id: conversationId, approval_id: activeApprovalId });
          await updateTokens();
          return {
            status: "DENY",
            reason: "Approval not found",
            memory
          };
        }

        step = {
          type: "tool_call",
          tool_name: approval.tool_name,
          arguments: approval.arguments as Record<string, unknown>
        };
      } else {
        // Consult the LLM to get the next step
        const nextResult = await nextStep(memory, tools);
        step = nextResult.step;
        accumulatedTokens += nextResult.tokens;
      }

      logger.info("Agent step generated", { conversation_id: conversationId, step_type: step.type });

      if (step.type === "final_answer") {
        memory.addMessage("assistant", step.answer);
        await updateTokens();
        logger.info("Agent execution completed with final answer", { conversation_id: conversationId });
        return {
          status: "SUCCESS",
          answer: step.answer,
          memory
        };
      }

      // Record tool call to assistant messages
      memory.addMessage("assistant", `Call tool ${step.tool_name} with arguments: ${JSON.stringify(step.arguments)}`);

      // Evaluate the tool execution policy using decide()
      const decisionContext = {
        tool_name: step.tool_name,
        arguments: step.arguments,
        approvalId: activeApprovalId
      };

      logger.info("Evaluating tool execution policy", { conversation_id: conversationId, tool_name: step.tool_name });
      const decisionResult = await decide(decisionContext, { conversationId, token: accumulatedTokens });
      logger.info("Policy decision evaluated", { conversation_id: conversationId, tool_name: step.tool_name, decision: decisionResult.decision });

      if (decisionResult.decision === "DENY") {
        await updateTokens();
        return {
          status: "DENY",
          reason: decisionResult.reason || "Tool execution denied",
          memory
        };
      }

      if (decisionResult.decision === "PENDING") {
        const approvalId = decisionResult.reason || activeApprovalId;
        if (approvalId) {
          memory.setApproval(approvalId);
        }
        await updateTokens();
        return {
          status: "PENDING",
          approvalId,
          memory
        };
      }

      if (decisionResult.decision === "ALLOW") {
        try {
          logger.info("Executing approved tool call", { conversation_id: conversationId, tool_name: step.tool_name });
          const result = await mcpExecutor.execute(step.tool_name, step.arguments, {
            conversationId,
            decision: "ALLOW"
          });

          // Reset approval ID once execution has completed
          activeApprovalId = undefined;
          memory.clearApproval();

          // Store results in memory history
          memory.addToolResult(result);
          memory.addMessage("tool", JSON.stringify(result));
        } catch (execError: any) {
          throw new Error(`Tool execution failed: ${execError.message || execError}`);
        }
      }
    }
  } catch (error: any) {
    logger.error("Agent execution failed with error", { conversation_id: conversationId, error_message: error.message || String(error) });
    try {
      await updateTokens();
    } catch (updateErr) {
      console.error("Failed to update tokens on failure:", updateErr);
    }
    // Fail-closed wrapper
    throw error;
  }
}
