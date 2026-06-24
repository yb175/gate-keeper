import { RuleResult } from "../../../types.js";
import { db, PolicyAction } from "@repo/db";
import { logger } from "../../../mcp/logger.js";

export default async function isblocked(
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

    if (policy?.action === PolicyAction.DENY) {
      return {
        success: true,
        result: true,
        reason: "Forbidden policy",
      };
    }
    return {
      success: true,
      result: false,
    };
  } catch (error: any) {
    logger.error("Database query failed in isblocked rule", {
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
