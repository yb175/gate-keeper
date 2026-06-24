import needsApproval from "./rules/approval.js";
import isblocked from "./rules/block.js";
import budgetExceeded from "./rules/budget.js";
import type { ApprovalRequest, ConversationRequest } from "../../types.js";
import { db } from "@repo/db";
import { logger } from "../../mcp/logger.js";

export interface PolicyEngineResult {
  allowed: boolean;
  requiresApproval: boolean;
  reason?: string;
}

export default async function PolicyEngine(
  context: ApprovalRequest,
  conversation: ConversationRequest,
): Promise<PolicyEngineResult> {
  let policy;
  try {
    const tool_name = context.tool_name;

    // Fetch the policy record once to prevent double lookup and TOCTOU race conditions
    policy = await db.policy.findUnique({
      where: { tool_name },
    });
  } catch (error: any) {
    logger.error("Failed to query policy table in PolicyEngine pre-fetch", {
      tool_name: context.tool_name,
      error_message: error.message || String(error),
    });
    return {
      allowed: false,
      requiresApproval: false,
      reason: "Failed to query policy table",
    };
  }

  try {
    const tool_name = context.tool_name;

    // 1. Block Check
    const blockedResult = await isblocked(tool_name, policy);
    if (!blockedResult.success) {
      return {
        allowed: false,
        requiresApproval: false,
        reason: blockedResult.reason,
      };
    }
    if (blockedResult.result) {
      return {
        allowed: false,
        requiresApproval: false,
        reason: blockedResult.reason,
      };
    }

    // 2. Budget Check
    const budgetResult = await budgetExceeded(
      conversation.conversationId,
      conversation.token,
    );
    if (!budgetResult.success) {
      return {
        allowed: false,
        requiresApproval: false,
        reason: budgetResult.reason,
      };
    }
    if (budgetResult.result) {
      return {
        allowed: false,
        requiresApproval: false,
        reason: budgetResult.reason,
      };
    }

    // 3. Approval Check
    const approvalResult = await needsApproval(tool_name);
    if (!approvalResult.success) {
      return {
        allowed: false,
        requiresApproval: false,
        reason: approvalResult.reason,
      };
    }
    if (approvalResult.result) {
      return {
        allowed: false,
        requiresApproval: true,
        reason: approvalResult.reason,
      };
    }

    // 4. Default Success (Allowed)
    return {
      allowed: true,
      requiresApproval: false,
    };
  } catch (error: any) {
    return {
      allowed: false,
      requiresApproval: false,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}
