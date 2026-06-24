import { db, PolicyAction } from "@repo/db";
import type { RuleResult } from "../../../types.js";

export default async function needsApproval(
  tool_name: string,
): Promise<RuleResult<boolean>> {
  try {
    const policy = await db.policy.findUnique({
      where: { tool_name },
    });

    return {
      success: true,
      result: policy?.action === PolicyAction.APPROVAL,
    };
  } catch (error) {
    return {
      success: false,
      result: false,
      reason: "Failed to query policy table",
    };
  }
}
