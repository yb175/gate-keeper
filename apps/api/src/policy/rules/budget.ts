import { RuleResult } from "../../../types.js";
import { db } from "@repo/db";
import { logger } from "../../../mcp/logger.js";

export default async function budgetExceeded(
  conversationId: string,
  token: number,
): Promise<RuleResult<boolean>> {
  try {
    // Reject executions without valid conversation context to prevent bypassing budget limits
    if (!conversationId || conversationId === "unknown") {
      return {
        success: false,
        result: false,
        reason: "Conversation context is missing or unknown",
      };
    }

    const conversation = await db.conversation.findUnique({
      where: { id: conversationId },
    });

    if (!conversation) {
      return {
        success: false,
        result: false,
        reason: `Conversation ${conversationId} not found`,
      };
    }

    const isExceeded =
      conversation.tokens_used + token > conversation.budget_limit;

    return {
      success: true,
      result: isExceeded,
      reason: isExceeded ? "Token budget exceeded" : undefined,
    };
  } catch (error: any) {
    logger.error("Database query failed in budgetExceeded rule", {
      conversation_id: conversationId,
      token,
      error_message: error instanceof Error ? error.message : String(error),
    });
    return {
      success: false,
      result: false,
      reason: "Failed to query conversation table",
    };
  }
}
