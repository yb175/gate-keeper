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
    // Intercept multiple parallel tool calls
    if (context.tool_name === "multiple_tool_calls") {
      const toolCalls = (context.arguments as any)?.tool_calls;
      if (!Array.isArray(toolCalls)) {
        // Audit the denial so this rejection path is never invisible
        try {
          await db.log.create({
            data: {
              tool_name: "multiple_tool_calls",
              decision: "DENY",
              reason: `Conversation: ${conversation.conversationId} | Invalid parallel tool_calls argument structure`,
            },
          });
        } catch (logErr) {
          console.error("Failed to write denial log for invalid parallel args:", logErr);
        }
        return {
          decision: "DENY",
          reason: "Invalid parallel tool calls arguments structure",
        };
      }

      // If activeApprovalId is provided, we check the status of the approval record
      if (context.approvalId) {
        const approval = await db.approval.findUnique({
          where: { id: context.approvalId },
        });

        if (!approval) {
          await db.log.create({
            data: {
              tool_name: "multiple_tool_calls",
              decision: "DENY",
              reason: `Conversation: ${conversation.conversationId} | Approval not found (ID: ${context.approvalId})`,
            },
          });
          return {
            decision: "DENY",
            reason: "Approval not found",
          };
        }

        if (approval.tool_name !== "multiple_tool_calls") {
          await db.log.create({
            data: {
              tool_name: "multiple_tool_calls",
              decision: "DENY",
              reason: `Conversation: ${conversation.conversationId} | Approval tool name mismatch (ID: ${context.approvalId})`,
            },
          });
          return {
            decision: "DENY",
            reason: "Approval tool name mismatch",
          };
        }

        switch (approval.status) {
          case ApprovalStatus.APPROVED:
            try {
              await db.approval.delete({
                where: { id: approval.id },
              });
            } catch (err: any) {
              // Only ignore "record not found" errors (concurrent resume by poller + manual click).
              // Any other delete failure is unexpected — log DENY and abort to preserve
              // single-use protection: if we cannot confirm deletion we must not allow.
              if (err?.code !== "P2025") {
                await db.log.create({
                  data: {
                    tool_name: "multiple_tool_calls",
                    decision: "DENY",
                    reason: `Conversation: ${conversation.conversationId} | Could not delete approval record, aborting to prevent replay (ID: ${approval.id})`,
                  },
                });
                return { decision: "DENY", reason: "Approval record deletion failed" };
              }
            }
            // Log ALLOW for each individual tool call only after confirmed deletion
            for (const tc of toolCalls) {
              await db.log.create({
                data: {
                  tool_name: tc.tool_name,
                  decision: "ALLOW",
                  reason: `Conversation: ${conversation.conversationId} | Approved by user in parallel step (ID: ${approval.id})`,
                },
              });
            }
            return {
              decision: "ALLOW",
            };
          case ApprovalStatus.PENDING:
            return {
              decision: "PENDING",
            };
          case ApprovalStatus.REJECTED:
            for (const tc of toolCalls) {
              await db.log.create({
                data: {
                  tool_name: tc.tool_name,
                  decision: "DENY",
                  reason: `Conversation: ${conversation.conversationId} | Rejected by user in parallel step (ID: ${approval.id})`,
                },
              });
            }
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

      // No approvalId provided, evaluate each tool call against PolicyEngine
      const pendingTools: typeof toolCalls = [];
      for (const tc of toolCalls) {
        const policyResult = await PolicyEngine(tc, conversation);
        if (!policyResult.allowed && !policyResult.requiresApproval) {
          // One of the tools is explicitly denied
          await db.log.create({
            data: {
              tool_name: tc.tool_name,
              decision: "DENY",
              reason: `Conversation: ${conversation.conversationId} | Blocked in parallel step: ${policyResult.reason || "Denied by policy configuration"}`,
            },
          });
          return {
            decision: "DENY",
            reason: `Tool execution blocked: ${tc.tool_name} - ${policyResult.reason || "Denied by policy configuration"}`,
          };
        }
        if (policyResult.requiresApproval) {
          pendingTools.push(tc);
        }
      }

      // If any tool requires approval, create a single approval record for multiple_tool_calls
      if (pendingTools.length > 0) {
        const created = await db.approval.create({
          data: {
            tool_name: "multiple_tool_calls",
            arguments: { tool_calls: toolCalls } as any,
            status: ApprovalStatus.PENDING,
          },
        });

        await db.log.create({
          data: {
            tool_name: "multiple_tool_calls",
            decision: "PENDING",
            reason: `Conversation: ${conversation.conversationId} | Parallel execution requires manual approval (ID: ${created.id})`,
          },
        });

        return {
          decision: "PENDING",
          reason: created.id,
        };
      }

      // All tool calls are allowed
      for (const tc of toolCalls) {
        await db.log.create({
          data: {
            tool_name: tc.tool_name,
            decision: "ALLOW",
            reason: `Conversation: ${conversation.conversationId} | Allowed by policy in parallel step`,
          },
        });
      }

      return {
        decision: "ALLOW",
      };
    }

    // Step 1: Call PolicyEngine
    const policy = await PolicyEngine(context, conversation);

    // Step 2: Policy denied and does not require approval
    if (!policy.allowed && !policy.requiresApproval) {
      await db.log.create({
        data: {
          tool_name: context.tool_name,
          decision: "DENY",
          reason: `Conversation: ${conversation.conversationId} | Blocked: ${policy.reason || "Denied by policy configuration"}`,
        },
      });
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

        await db.log.create({
          data: {
            tool_name: context.tool_name,
            decision: "PENDING",
            reason: `Conversation: ${conversation.conversationId} | Requires manual approval (ID: ${created.id})`,
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
        await db.log.create({
          data: {
            tool_name: context.tool_name,
            decision: "DENY",
            reason: `Conversation: ${conversation.conversationId} | Approval not found (ID: ${context.approvalId})`,
          },
        });
        return {
          decision: "DENY",
          reason: "Approval not found",
        };
      }

      if (approval.tool_name !== context.tool_name) {
        await db.log.create({
          data: {
            tool_name: context.tool_name,
            decision: "DENY",
            reason: `Conversation: ${conversation.conversationId} | Approval tool name mismatch (ID: ${context.approvalId})`,
          },
        });
        return {
          decision: "DENY",
          reason: "Approval tool name mismatch",
        };
      }

      switch (approval.status) {
        case ApprovalStatus.APPROVED:
          try {
            await db.approval.delete({
              where: { id: approval.id },
            });
          } catch (err: any) {
            // Only ignore "record not found" errors (concurrent resume).
            // Any other failure aborts to preserve single-use protection.
            if (err?.code !== "P2025") {
              await db.log.create({
                data: {
                  tool_name: context.tool_name,
                  decision: "DENY",
                  reason: `Conversation: ${conversation.conversationId} | Could not delete approval record, aborting to prevent replay (ID: ${approval.id})`,
                },
              });
              return { decision: "DENY", reason: "Approval record deletion failed" };
            }
          }
          // Write ALLOW log only after deletion is confirmed
          await db.log.create({
            data: {
              tool_name: context.tool_name,
              decision: "ALLOW",
              reason: `Conversation: ${conversation.conversationId} | Approved by user (ID: ${approval.id})`,
            },
          });
          return {
            decision: "ALLOW",
          };
        case ApprovalStatus.PENDING:
          // We do not write duplicate pending logs on query iterations
          return {
            decision: "PENDING",
          };
        case ApprovalStatus.REJECTED:
          await db.log.create({
            data: {
              tool_name: context.tool_name,
              decision: "DENY",
              reason: `Conversation: ${conversation.conversationId} | Rejected by user (ID: ${approval.id})`,
            },
          });
          return {
            decision: "DENY",
            reason: "Approval rejected",
          };
        default:
          await db.log.create({
            data: {
              tool_name: context.tool_name,
              decision: "DENY",
              reason: `Conversation: ${conversation.conversationId} | Unrecognized approval status (ID: ${approval.id})`,
            },
          });
          return {
            decision: "DENY",
            reason: "Unrecognized approval status",
          };
      }
    }

    // Step 4: Policy allowed
    if (policy.allowed) {
      await db.log.create({
        data: {
          tool_name: context.tool_name,
          decision: "ALLOW",
          reason: `Conversation: ${conversation.conversationId} | Allowed by policy`,
        },
      });
      return {
        decision: "ALLOW",
      };
    }

    // Fallback/Safety return
    await db.log.create({
      data: {
        tool_name: context.tool_name,
        decision: "DENY",
        reason: `Conversation: ${conversation.conversationId} | Unrecognized policy state`,
      },
    });
    return {
      decision: "DENY",
      reason: "Unrecognized policy state",
    };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    try {
      await db.log.create({
        data: {
          tool_name: context.tool_name,
          decision: "DENY",
          reason: `Conversation: ${conversation.conversationId} | Decision engine failure: ${errMsg}`,
        },
      });
    } catch (logErr) {
      console.error("Failed to write failure log:", logErr);
    }
    return {
      decision: "DENY",
      reason: "Decision engine failure",
    };
  }
}
