import { RuleResult } from "../../../types.js";
import { db, PolicyAction } from "@repo/db";
export default async function isblocked(
  tool_name: string,
): Promise<RuleResult<boolean>> {
  try {
    const policy = await db.policy.findUnique({
      where: { tool_name },
    });
    if (policy?.action == PolicyAction.DENY) {
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
  } catch (error) {
    console.error("db error:", error);

    return {
      success: false,
      result: false,
      reason: "Failed to query policy table",
    };
  }
}
