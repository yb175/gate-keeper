import { db, ApprovalStatus } from "@repo/db";
import PolicyEngine from "./engine.js";
import type { ApprovalRequest, ConversationRequest } from "../../types.js";

export type Decision = "ALLOW" | "DENY" | "PENDING";

export interface DecisionResult {
  decision: Decision;
  reason?: string;
}

export async function decide(
  context: ApprovalRequest,
  conversation: ConversationRequest,
): Promise<DecisionResult> {
  try {
    // Step 1: Call PolicyEngine
    const policy = await PolicyEngine(context, conversation);

    // Step 2: Policy denied and does not require approval
    if (!policy.allowed && !policy.requiresApproval) {
      return {
        decision: "DENY",
        reason: policy.reason,
      };
    }

    // Step 3: Policy requires human approval
    if (policy.requiresApproval) {
      if (!context.approvalId) {
        const created = await db.approval.create({
          data: {
            tool_name: context.tool_name,
            arguments: context.arguments as any,
            status: ApprovalStatus.PENDING,
          },
        });

        return {
          decision: "PENDING",
          reason: created.id,
        };
      }

      const approval = await db.approval.findUnique({
        where: {
          id: context.approvalId,
        },
      });

      if (!approval) {
        return {
          decision: "DENY",
          reason: "Approval not found",
        };
      }

      if (approval.tool_name !== context.tool_name) {
        return {
          decision: "DENY",
          reason: "Approval tool name mismatch",
        };
      }

      switch (approval.status) {
        case ApprovalStatus.APPROVED:
          await db.approval.delete({
            where: { id: approval.id },
          });
          return {
            decision: "ALLOW",
          };
        case ApprovalStatus.PENDING:
          return {
            decision: "PENDING",
          };
        case ApprovalStatus.REJECTED:
          return {
            decision: "DENY",
            reason: "Approval rejected",
          };
        default:
          return {
            decision: "DENY",
            reason: "Unrecognized approval status",
          };
      }
    }

    // Step 4: Policy allowed
    if (policy.allowed) {
      return {
        decision: "ALLOW",
      };
    }

    // Fallback/Safety return
    return {
      decision: "DENY",
      reason: "Unrecognized policy state",
    };
  } catch (error) {
    return {
      decision: "DENY",
      reason: "Decision engine failure",
    };
  }
}
