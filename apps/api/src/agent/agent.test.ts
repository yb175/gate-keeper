import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { runAgent } from "./loop.js";
import { createMemory } from "./memory.js";
import { llmClient, nextStep } from "./llm.js";

// Mock @repo/db
vi.mock("@repo/db", () => {
  const ApprovalStatus = {
    PENDING: "PENDING",
    APPROVED: "APPROVED",
    REJECTED: "REJECTED",
  };
  return {
    ApprovalStatus,
    db: {
      approval: {
        findUnique: vi.fn(),
      },
      conversation: {
        findUnique: vi.fn(),
        update: vi.fn(),
        upsert: vi.fn(),
      },
    },
  };
});

// Import mocked db
import { db } from "@repo/db";

// Mock decision engine
vi.mock("../policy/decision.js", () => {
  return {
    decide: vi.fn(),
  };
});
import { decide } from "../policy/decision.js";

// Mock MCP bootstrapping
vi.mock("../../mcp/bootstrap.js", () => {
  return {
    mcpDiscovery: {
      discoverTools: vi.fn(),
    },
    mcpExecutor: {
      execute: vi.fn(),
    },
  };
});
import { mcpDiscovery, mcpExecutor } from "../../mcp/bootstrap.js";

describe("Agent Module & Execution Loop", () => {
  const mockTool = {
    name: "test_tool",
    description: "A test tool description",
    inputSchema: {
      type: "object",
      properties: {
        arg1: { type: "string" },
      },
      required: ["arg1"],
    },
    execute: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(db.conversation.findUnique).mockResolvedValue({
      id: "conv-1",
      tokens_used: 0,
      budget_limit: 1000,
      budget_reset_at: new Date(),
      createdAt: new Date(),
    } as any);
    vi.mocked(db.conversation.update).mockResolvedValue({} as any);
    vi.mocked(db.conversation.upsert).mockResolvedValue({} as any);

    // Default discovery stub returning the test tool
    const mockToolsMap = new Map();
    mockToolsMap.set("test_tool", {
      server: { name: "test_server" },
      tool: mockTool,
    });
    vi.mocked(mcpDiscovery.discoverTools).mockResolvedValue(mockToolsMap);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // 1) tool call - LLM requests a tool call
  it("scenario 1: tool call gets evaluated and mapped properly in the loop", async () => {
    vi.spyOn(llmClient, "callModel").mockResolvedValue(
      JSON.stringify({
        type: "tool_call",
        tool_name: "test_tool",
        arguments: { arg1: "hello" },
      }),
    );

    vi.mocked(decide).mockResolvedValue({
      decision: "PENDING",
      reason: "approval-uuid-1",
    });

    const result = await runAgent("Perform task", "conv-1");
    expect(result.status).toBe("PENDING");
    expect(result.approvalId).toBe("approval-uuid-1");
    expect(decide).toHaveBeenCalledWith(
      expect.objectContaining({
        tool_name: "test_tool",
        arguments: { arg1: "hello" },
      }),
      { conversationId: "conv-1", token: expect.any(Number) },
    );
  });

  // 2) final answer - LLM returns a final answer
  it("scenario 2: final answer stops execution and returns success", async () => {
    vi.spyOn(llmClient, "callModel").mockResolvedValue(
      JSON.stringify({
        type: "final_answer",
        answer: "Task completed successfully.",
      }),
    );

    const result = await runAgent("Perform task", "conv-1");
    expect(result.status).toBe("SUCCESS");
    expect(result.answer).toBe("Task completed successfully.");
    expect(result.memory.messages).toContainEqual({
      role: "assistant",
      content: "Task completed successfully.",
    });
  });

  // 3) approval pending - tool call requires approval, decide() returns PENDING
  it("scenario 3: decision PENDING saves approvalId and returns PENDING status", async () => {
    vi.spyOn(llmClient, "callModel").mockResolvedValue(
      JSON.stringify({
        type: "tool_call",
        tool_name: "test_tool",
        arguments: { arg1: "value" },
      }),
    );

    vi.mocked(decide).mockResolvedValue({
      decision: "PENDING",
      reason: "pending-approval-id",
    });

    const result = await runAgent("Start workflow", "conv-2");
    expect(result.status).toBe("PENDING");
    expect(result.approvalId).toBe("pending-approval-id");
    expect(result.memory.approvalId).toBe("pending-approval-id");
  });

  // 4) denied tool - tool call is denied, decide() returns DENY
  it("scenario 4: decision DENY stops execution and returns DENY status", async () => {
    vi.spyOn(llmClient, "callModel").mockResolvedValue(
      JSON.stringify({
        type: "tool_call",
        tool_name: "test_tool",
        arguments: { arg1: "forbidden" },
      }),
    );

    vi.mocked(decide).mockResolvedValue({
      decision: "DENY",
      reason: "Tool execution blocked by policy",
    });

    const result = await runAgent("Run forbidden action", "conv-3");
    expect(result.status).toBe("DENY");
    expect(result.reason).toBe("Tool execution blocked by policy");
  });

  // 5) successful execution - tool call is allowed and executes successfully
  it("scenario 5: allowed tool call executes successfully, records result, and requests next step", async () => {
    // 1st call: request tool
    // 2nd call: return final answer
    let callCount = 0;
    vi.spyOn(llmClient, "callModel").mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        return JSON.stringify({
          type: "tool_call",
          tool_name: "test_tool",
          arguments: { arg1: "valid-input" },
        });
      }
      return JSON.stringify({
        type: "final_answer",
        answer: "Execution completed successfully.",
      });
    });

    vi.mocked(decide).mockResolvedValue({
      decision: "ALLOW",
    });

    vi.mocked(mcpExecutor.execute).mockResolvedValue("Success output");

    const result = await runAgent("Run action", "conv-4");
    expect(result.status).toBe("SUCCESS");
    expect(result.answer).toBe("Execution completed successfully.");
    expect(mcpExecutor.execute).toHaveBeenCalledWith(
      "test_tool",
      { arg1: "valid-input" },
      { conversationId: "conv-4", decision: "ALLOW" },
    );
    expect(result.memory.toolResults).toContain("Success output");
  });

  // 6) invalid llm output - LLM returns something that is not valid JSON or doesn't match expected schema
  it("scenario 6: invalid argument type fails schema validation and throws error", async () => {
    vi.spyOn(llmClient, "callModel").mockResolvedValue(
      JSON.stringify({
        type: "tool_call",
        tool_name: "test_tool",
        arguments: { arg1: 12345 }, // arg1 must be string
      }),
    );

    await expect(runAgent("Run action", "conv-5")).rejects.toThrow(
      "Invalid arguments for tool test_tool",
    );
  });

  it("scenario 6b: unknown tool rejection", async () => {
    vi.spyOn(llmClient, "callModel").mockResolvedValue(
      JSON.stringify({
        type: "tool_call",
        tool_name: "unknown_tool",
        arguments: {},
      }),
    );

    await expect(runAgent("Run action", "conv-5")).rejects.toThrow(
      "Unknown tool: unknown_tool",
    );
  });

  // 7) executor throws - MCP executor throws an error
  it("scenario 7: executor exception throws an error and fails closed", async () => {
    vi.spyOn(llmClient, "callModel").mockResolvedValue(
      JSON.stringify({
        type: "tool_call",
        tool_name: "test_tool",
        arguments: { arg1: "trigger-fail" },
      }),
    );

    vi.mocked(decide).mockResolvedValue({
      decision: "ALLOW",
    });

    vi.mocked(mcpExecutor.execute).mockRejectedValue(
      new Error("Executor crash"),
    );

    await expect(runAgent("Fail task", "conv-6")).rejects.toThrow(
      "Tool execution failed: Executor crash",
    );
  });

  // 8) malformed json - LLM output is not valid JSON
  it("scenario 8: malformed json from LLM throws error", async () => {
    vi.spyOn(llmClient, "callModel").mockResolvedValue("not-json-format");

    await expect(runAgent("Fail task", "conv-7")).rejects.toThrow(
      "Malformed JSON from LLM response",
    );
  });

  // 9) approval resumes execution - agent is resumed with an approvalId and continues
  it("scenario 9: agent loop resumes from approval ID, skips nextStep for the first call, and proceeds", async () => {
    // Mock db.approval.findUnique to return the original tool call parameters
    vi.mocked(db.approval.findUnique).mockResolvedValue({
      id: "approval-999",
      tool_name: "test_tool",
      arguments: { arg1: "resumed-val" },
      status: "APPROVED" as any,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // decision of ALLOW when decisionContext includes the approved approvalId
    vi.mocked(decide).mockResolvedValue({
      decision: "ALLOW",
    });

    vi.mocked(mcpExecutor.execute).mockResolvedValue(
      "Resumed execution success",
    );

    // The model is only called once after the executor finishes to retrieve the final answer
    vi.spyOn(llmClient, "callModel").mockResolvedValue(
      JSON.stringify({
        type: "final_answer",
        answer: "Completed resumed action.",
      }),
    );

    const memory = createMemory();
    memory.addMessage("user", "Run step 1");
    // Resume agent with the approval ID
    const result = await runAgent(null, "conv-8", {
      memory,
      approvalId: "approval-999",
    });

    expect(result.status).toBe("SUCCESS");
    expect(result.answer).toBe("Completed resumed action.");
    expect(db.approval.findUnique).toHaveBeenCalledWith({
      where: { id: "approval-999" },
    });
    expect(decide).toHaveBeenCalledWith(
      expect.objectContaining({
        tool_name: "test_tool",
        arguments: { arg1: "resumed-val" },
        approvalId: "approval-999",
      }),
      { conversationId: "conv-8", token: 0 },
    );
    expect(mcpExecutor.execute).toHaveBeenCalledWith(
      "test_tool",
      { arg1: "resumed-val" },
      { conversationId: "conv-8", decision: "ALLOW" },
    );
    expect(result.memory.toolResults).toContain("Resumed execution success");
  });

  // 10) iteration limit - LLM repeats tool calls excessively
  it("scenario 10: agent loop terminates and throws error if iteration limit is exceeded", async () => {
    // Return a tool call every time so the agent loops continuously
    vi.spyOn(llmClient, "callModel").mockResolvedValue(
      JSON.stringify({
        type: "tool_call",
        tool_name: "test_tool",
        arguments: { arg1: "looping" },
      }),
    );

    vi.mocked(decide).mockResolvedValue({
      decision: "ALLOW",
    });

    vi.mocked(mcpExecutor.execute).mockResolvedValue("Executed ok");

    await expect(runAgent("Loop forever", "conv-9")).rejects.toThrow(
      "Agent loop iteration limit exceeded",
    );
  });

  // 11) budget reset logic - automatically resets if 3 minutes have passed since budget_reset_at
  it("scenario 11: agent loop resets budget when elapsed time since budget_reset_at is > 3 minutes", async () => {
    vi.spyOn(llmClient, "callModel").mockResolvedValue(
      JSON.stringify({
        type: "final_answer",
        answer: "Finished",
      }),
    );

    // Mock upsert to return a conversation that was reset 4 minutes ago
    const expiredResetAt = new Date(Date.now() - 4 * 60 * 1000);
    vi.mocked(db.conversation.upsert).mockResolvedValue({
      id: "conv-10",
      tokens_used: 15000,
      budget_limit: 20000,
      budget_reset_at: expiredResetAt,
      createdAt: new Date(Date.now() - 10 * 60 * 1000),
    } as any);

    await runAgent("Reset check", "conv-10");

    expect(db.conversation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "conv-10" },
        data: expect.objectContaining({
          tokens_used: 0,
          budget_reset_at: expect.any(Date),
        }),
      }),
    );
  });

  // 12) resume pending - approval status is PENDING
  it("scenario 12: agent loop returns PENDING if resumed approval is in PENDING status", async () => {
    // Mock db.approval.findUnique to return a PENDING record
    vi.mocked(db.approval.findUnique).mockResolvedValue({
      id: "approval-998",
      tool_name: "test_tool",
      arguments: { arg1: "resumed-val" },
      status: "PENDING" as any,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const memory = createMemory();
    const result = await runAgent(null, "conv-11", {
      memory,
      approvalId: "approval-998",
    });

    expect(result.status).toBe("PENDING");
    expect(result.approvalId).toBe("approval-998");
  });

  // 13) resume rejected - approval status is REJECTED
  it("scenario 13: agent loop denies execution if resumed approval is in REJECTED status", async () => {
    // Mock db.approval.findUnique to return a REJECTED record
    vi.mocked(db.approval.findUnique).mockResolvedValue({
      id: "approval-997",
      tool_name: "test_tool",
      arguments: { arg1: "resumed-val" },
      status: "REJECTED" as any,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const memory = createMemory();
    const result = await runAgent(null, "conv-12", {
      memory,
      approvalId: "approval-997",
    });

    expect(result.status).toBe("DENY");
    expect(result.reason).toBe("Approval not approved");
  });

  // 14) Parallel Tool Execution tests
  describe("Parallel Tool Execution", () => {
    it("should parse type: tool_calls from LLM and validate schemas", async () => {
      vi.spyOn(llmClient, "callModel").mockResolvedValue(
        JSON.stringify({
          type: "tool_calls",
          tool_calls: [
            { tool_name: "test_tool", arguments: { arg1: "val1" } },
            { tool_name: "test_tool", arguments: { arg1: "val2" } },
          ],
        }),
      );

      const memory = createMemory();
      const tools = [
        {
          name: "test_tool",
          description: "A test tool",
          inputSchema: {
            type: "object",
            properties: { arg1: { type: "string" } },
          },
          execute: vi.fn(),
        },
      ];

      const res = await nextStep(memory, tools);
      expect(res.step.type).toBe("tool_calls");
      if (res.step.type === "tool_calls") {
        expect(res.step.tool_calls).toHaveLength(2);
        expect(res.step.tool_calls[0]?.tool_name).toBe("test_tool");
      }
    });

    it("should execute parallel tool calls successfully when allowed", async () => {
      let callCount = 0;
      vi.spyOn(llmClient, "callModel").mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          return JSON.stringify({
            type: "tool_calls",
            tool_calls: [
              { tool_name: "test_tool", arguments: { arg1: "val1" } },
              { tool_name: "test_tool", arguments: { arg1: "val2" } },
            ],
          });
        }
        return JSON.stringify({
          type: "final_answer",
          answer: "Finished parallel work.",
        });
      });

      vi.mocked(decide).mockResolvedValue({
        decision: "ALLOW",
      });

      vi.mocked(mcpExecutor.execute).mockResolvedValue("mockResult");

      const result = await runAgent("Do parallel tasks", "conv-parallel-1");
      expect(result.status).toBe("SUCCESS");
      expect(result.answer).toBe("Finished parallel work.");
      expect(mcpExecutor.execute).toHaveBeenCalledTimes(2);
      expect(result.memory.toolResults).toContain("mockResult");
    });

    it("should request approval for parallel tool calls when pending", async () => {
      vi.spyOn(llmClient, "callModel").mockResolvedValue(
        JSON.stringify({
          type: "tool_calls",
          tool_calls: [{ tool_name: "test_tool", arguments: { arg1: "val1" } }],
        }),
      );

      vi.mocked(decide).mockResolvedValue({
        decision: "PENDING",
        reason: "approval-parallel-123",
      });

      const result = await runAgent(
        "Do parallel task requiring approval",
        "conv-parallel-2",
      );
      expect(result.status).toBe("PENDING");
      expect(result.approvalId).toBe("approval-parallel-123");
      expect(result.memory.approvalId).toBe("approval-parallel-123");
    });
  });

  describe("Gemini API Client Timeout", () => {
    afterEach(() => {
      vi.unstubAllGlobals();
      delete process.env.GEMINI_TIMEOUT_MS;
    });

    it("should abort the fetch request if it exceeds the timeout limit", async () => {
      vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
        expect(init?.signal).toBeDefined();
        await new Promise((_, reject) => {
          if (init?.signal) {
            init.signal.addEventListener("abort", () => {
              reject(
                new DOMException("The operation was aborted.", "AbortError"),
              );
            });
          }
        });
        throw new Error("Should have timed out and aborted");
      });

      process.env.GEMINI_API_KEY = "dummy-key";
      process.env.GEMINI_TIMEOUT_MS = "50"; // 50ms timeout for test speed

      await expect(llmClient.callModel("Hello")).rejects.toThrow(
        "The operation was aborted",
      );
    });

    it("should fall back to default timeout and execute normally if env timeout is invalid", async () => {
      vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
        expect(init?.signal).toBeDefined();
        return {
          ok: true,
          json: async () => ({
            candidates: [
              {
                content: { parts: [{ text: "response-ok" }] },
              },
            ],
          }),
        } as any;
      });

      process.env.GEMINI_API_KEY = "dummy-key";
      process.env.GEMINI_TIMEOUT_MS = "invalid-value"; // invalid non-number value

      const res = await llmClient.callModel("Hello");
      expect(res).toBe("response-ok");
    });
  });
});
