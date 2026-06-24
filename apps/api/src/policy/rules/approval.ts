import { db, PolicyAction } from "@repo/db";
import type { RuleResult } from "../../../types.js";
import { logger } from "../../../mcp/logger.js";

export default async function needsApproval(
  tool_name: string,
  preFetchedPolicy?: any,
): Promise<RuleResult<boolean>> {
  try {
    const policy =
      preFetchedPolicy !== undefined
        ? preFetchedPolicy
        : await db.policy.findUnique({
            where: { tool_name },
          });

    // Implicit fallback: if no policy is registered, default to APPROVAL
    const action = policy ? policy.action : PolicyAction.APPROVAL;

    return {
      success: true,
      result: action === PolicyAction.APPROVAL,
    };
  } catch (error: any) {
    logger.error("Database query failed in needsApproval rule", {
      tool_name,
      error_message: error.message || String(error),
    });

    return {
      success: false,
      result: false,
      reason: "Failed to query policy table",
    };
  }
}
