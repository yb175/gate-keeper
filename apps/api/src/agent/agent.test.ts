import { vi, describe, it, expect, beforeEach } from "vitest";
import { runAgent } from "./loop.js";
import { createMemory } from "./memory.js";
import { llmClient } from "./llm.js";

// Mock @repo/db
vi.mock("@repo/db", () => {
  return {
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
    
    // Mock conversation database queries
    vi.mocked(db.conversation.findUnique).mockResolvedValue({
      id: "conv-1",
      tokens_used: 0,
      budget_limit: 1000,
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

  // 1) tool call - LLM requests a tool call
  it("scenario 1: tool call gets evaluated and mapped properly in the loop", async () => {
    vi.spyOn(llmClient, "callModel").mockResolvedValue(
      JSON.stringify({
        type: "tool_call",
        tool_name: "test_tool",
        arguments: { arg1: "hello" },
      })
    );
    
    vi.mocked(decide).mockResolvedValue({
      decision: "PENDING",
      reason: "approval-uuid-1",
    });

    const result = await runAgent("Perform task", "conv-1", 100);
    expect(result.status).toBe("PENDING");
    expect(result.approvalId).toBe("approval-uuid-1");
    expect(decide).toHaveBeenCalledWith(
      expect.objectContaining({
        tool_name: "test_tool",
        arguments: { arg1: "hello" },
      }),
      { conversationId: "conv-1", token: expect.any(Number) }
    );
  });

  // 2) final answer - LLM returns a final answer
  it("scenario 2: final answer stops execution and returns success", async () => {
    vi.spyOn(llmClient, "callModel").mockResolvedValue(
      JSON.stringify({
        type: "final_answer",
        answer: "Task completed successfully.",
      })
    );

    const result = await runAgent("Perform task", "conv-1", 100);
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
      })
    );

    vi.mocked(decide).mockResolvedValue({
      decision: "PENDING",
      reason: "pending-approval-id",
    });

    const result = await runAgent("Start workflow", "conv-2", 200);
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
      })
    );

    vi.mocked(decide).mockResolvedValue({
      decision: "DENY",
      reason: "Tool execution blocked by policy",
    });

    const result = await runAgent("Run forbidden action", "conv-3", 300);
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

    const result = await runAgent("Run action", "conv-4", 400);
    expect(result.status).toBe("SUCCESS");
    expect(result.answer).toBe("Execution completed successfully.");
    expect(mcpExecutor.execute).toHaveBeenCalledWith(
      "test_tool",
      { arg1: "valid-input" },
      { conversationId: "conv-4", decision: "ALLOW" }
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
      })
    );

    await expect(runAgent("Run action", "conv-5", 500)).rejects.toThrow(
      "Invalid arguments for tool test_tool"
    );
  });

  it("scenario 6b: unknown tool rejection", async () => {
    vi.spyOn(llmClient, "callModel").mockResolvedValue(
      JSON.stringify({
        type: "tool_call",
        tool_name: "unknown_tool",
        arguments: {},
      })
    );

    await expect(runAgent("Run action", "conv-5", 500)).rejects.toThrow(
      "Unknown tool: unknown_tool"
    );
  });

  // 7) executor throws - MCP executor throws an error
  it("scenario 7: executor exception throws an error and fails closed", async () => {
    vi.spyOn(llmClient, "callModel").mockResolvedValue(
      JSON.stringify({
        type: "tool_call",
        tool_name: "test_tool",
        arguments: { arg1: "trigger-fail" },
      })
    );

    vi.mocked(decide).mockResolvedValue({
      decision: "ALLOW",
    });

    vi.mocked(mcpExecutor.execute).mockRejectedValue(new Error("Executor crash"));

    await expect(runAgent("Fail task", "conv-6", 600)).rejects.toThrow(
      "Tool execution failed: Executor crash"
    );
  });

  // 8) malformed json - LLM output is not valid JSON
  it("scenario 8: malformed json from LLM throws error", async () => {
    vi.spyOn(llmClient, "callModel").mockResolvedValue("not-json-format");

    await expect(runAgent("Fail task", "conv-7", 700)).rejects.toThrow(
      "Malformed JSON from LLM response"
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

    vi.mocked(mcpExecutor.execute).mockResolvedValue("Resumed execution success");

    // The model is only called once after the executor finishes to retrieve the final answer
    vi.spyOn(llmClient, "callModel").mockResolvedValue(
      JSON.stringify({
        type: "final_answer",
        answer: "Completed resumed action.",
      })
    );

    const memory = createMemory();
    memory.addMessage("user", "Run step 1");
    // Resume agent with the approval ID
    const result = await runAgent(null, "conv-8", 800, {
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
      { conversationId: "conv-8", token: 0 }
    );
    expect(mcpExecutor.execute).toHaveBeenCalledWith(
      "test_tool",
      { arg1: "resumed-val" },
      { conversationId: "conv-8", decision: "ALLOW" }
    );
    expect(result.memory.toolResults).toContain("Resumed execution success");
  });
});
