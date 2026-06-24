import needsApproval from "./rules/approval.js";
import isblocked from "./rules/block.js";
import budgetExceeded from "./rules/budget.js";
import type { ApprovalRequest, ConversationRequest } from "../../types.js";

export interface PolicyEngineResult {
  allowed: boolean;
  requiresApproval: boolean;
  reason?: string;
}

export default async function PolicyEngine(
  context: ApprovalRequest,
  conversation: ConversationRequest,
): Promise<PolicyEngineResult> {
  try {
    const tool_name = context.tool_name;

    // 1. Block Check
    const blockedResult = await isblocked(tool_name);
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
      reason: error?.message || "Internal policy engine failure",
    };
  }
}
