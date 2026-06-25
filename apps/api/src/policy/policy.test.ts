import { vi, describe, it, expect, beforeEach } from "vitest";
import { Request, Response } from "express";

// 1. Mock @repo/db before imports to prevent real DB queries
vi.mock("@repo/db", () => {
  const PolicyAction = {
    ALLOW: "ALLOW",
    APPROVAL: "APPROVAL",
    DENY: "DENY",
  };
  const ApprovalStatus = {
    PENDING: "PENDING",
    APPROVED: "APPROVED",
    REJECTED: "REJECTED",
  };
  return {
    PolicyAction,
    ApprovalStatus,
    db: {
      policy: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      conversation: {
        findUnique: vi.fn(),
      },
      approval: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
        delete: vi.fn(),
        updateMany: vi.fn(),
      },
    },
  };
});

// Import db and PolicyAction/ApprovalStatus from the mocked package
import { db, PolicyAction, ApprovalStatus } from "@repo/db";

// Import modules to test
import isblocked from "./rules/block.js";
import budgetExceeded from "./rules/budget.js";
import needsApproval from "./rules/approval.js";
import PolicyEngine from "./engine.js";
import { decide } from "./decision.js";
import policiesRouter from "./router.js";

// Helper to construct Express Response mock
function mockResponse() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.end = vi.fn().mockReturnValue(res);
  return res as Response;
}

// Extract express handler helpers
const getHandler = (path: string, method: string) => {
  const layer = (policiesRouter as any).stack.find(
    (l: any) =>
      l.route?.path === path && l.route?.methods?.[method.toLowerCase()],
  );
  return layer?.route?.stack[0]?.handle;
};

describe("Policy Engine Rules & Orchestrator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Rule: isblocked", () => {
    it("should return blocked=true if PolicyAction is DENY", async () => {
      vi.mocked(db.policy.findUnique).mockResolvedValue({
        id: "1",
        tool_name: "test_tool",
        action: PolicyAction.DENY,
        sandbox_path: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await isblocked("test_tool");
      expect(res.success).toBe(true);
      expect(res.result).toBe(true);
      expect(res.reason).toBe("Forbidden policy");
    });

    it("should return blocked=false if PolicyAction is not DENY", async () => {
      vi.mocked(db.policy.findUnique).mockResolvedValue({
        id: "1",
        tool_name: "test_tool",
        action: PolicyAction.ALLOW,
        sandbox_path: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await isblocked("test_tool");
      expect(res.success).toBe(true);
      expect(res.result).toBe(false);
    });

    it("should fail gracefully and return success:false on db error", async () => {
      vi.mocked(db.policy.findUnique).mockRejectedValue(new Error("DB error"));
      const res = await isblocked("test_tool");
      expect(res.success).toBe(false);
      expect(res.result).toBe(false);
      expect(res.reason).toBe("Failed to query policy table");
    });
  });

  describe("Rule: budgetExceeded", () => {
    it("should return exceeded=false when total tokens are within budget", async () => {
      vi.mocked(db.conversation.findUnique).mockResolvedValue({
        id: "conv-1",
        tokens_used: 100,
        budget_limit: 1000,
        budget_reset_at: new Date(),
        createdAt: new Date(),
      });

      const res = await budgetExceeded("conv-1", 50);
      expect(res.success).toBe(true);
      expect(res.result).toBe(false);
    });

    it("should return exceeded=true when total tokens exceed budget", async () => {
      vi.mocked(db.conversation.findUnique).mockResolvedValue({
        id: "conv-1",
        tokens_used: 950,
        budget_limit: 1000,
        budget_reset_at: new Date(),
        createdAt: new Date(),
      });

      const res = await budgetExceeded("conv-1", 100);
      expect(res.success).toBe(true);
      expect(res.result).toBe(true);
      expect(res.reason).toBe("Token budget exceeded");
    });

    it("should return success:false if conversation is not found", async () => {
      vi.mocked(db.conversation.findUnique).mockResolvedValue(null);
      const res = await budgetExceeded("conv-missing", 10);
      expect(res.success).toBe(false);
      expect(res.result).toBe(false);
      expect(res.reason).toBe("Conversation conv-missing not found");
    });

    it("should return success:false if conversationId is missing or unknown", async () => {
      const res = await budgetExceeded("unknown", 10);
      expect(res.success).toBe(false);
      expect(res.result).toBe(false);
      expect(res.reason).toBe("Conversation context is missing or unknown");
    });
  });

  describe("Rule: needsApproval", () => {
    it("should return result=true if PolicyAction is APPROVAL", async () => {
      vi.mocked(db.policy.findUnique).mockResolvedValue({
        id: "1",
        tool_name: "test_tool",
        action: PolicyAction.APPROVAL,
        sandbox_path: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await needsApproval("test_tool");
      expect(res.success).toBe(true);
      expect(res.result).toBe(true);
    });

    it("should return result=false if PolicyAction is not APPROVAL", async () => {
      vi.mocked(db.policy.findUnique).mockResolvedValue({
        id: "1",
        tool_name: "test_tool",
        action: PolicyAction.ALLOW,
        sandbox_path: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await needsApproval("test_tool");
      expect(res.success).toBe(true);
      expect(res.result).toBe(false);
    });
  });

  describe("PolicyEngine Orchestrator", () => {
    it("should allow tool execution when all checks pass", async () => {
      vi.mocked(db.policy.findUnique).mockResolvedValue({
        id: "1",
        tool_name: "test_tool",
        action: PolicyAction.ALLOW,
        sandbox_path: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      vi.mocked(db.conversation.findUnique).mockResolvedValue({
        id: "conv-1",
        tokens_used: 10,
        budget_limit: 100,
        budget_reset_at: new Date(),
        createdAt: new Date(),
      });

      const res = await PolicyEngine(
        { tool_name: "test_tool", arguments: {} },
        { conversationId: "conv-1", token: 10 },
      );

      expect(res.allowed).toBe(true);
      expect(res.requiresApproval).toBe(false);
    });

    it("should fail closed and return allowed:false if block check fails", async () => {
      vi.mocked(db.policy.findUnique).mockRejectedValue(new Error("DB error"));

      const res = await PolicyEngine(
        { tool_name: "test_tool", arguments: {} },
        { conversationId: "conv-1", token: 10 },
      );

      expect(res.allowed).toBe(false);
      expect(res.requiresApproval).toBe(false);
      expect(res.reason).toBe("Failed to query policy table");
    });
  });
});

describe("Decision Orchestration (decide)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return ALLOW when policy is allowed", async () => {
    vi.mocked(db.policy.findUnique).mockResolvedValue({
      id: "1",
      tool_name: "test_tool",
      action: PolicyAction.ALLOW,
      sandbox_path: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    vi.mocked(db.conversation.findUnique).mockResolvedValue({
      id: "conv-1",
      tokens_used: 10,
      budget_limit: 100,
      budget_reset_at: new Date(),
      createdAt: new Date(),
    });

    const res = await decide(
      { tool_name: "test_tool", arguments: {} },
      { conversationId: "conv-1", token: 5 },
    );

    expect(res.decision).toBe("ALLOW");
  });

  it("should create a new pending approval and return PENDING with generated ID if requiresApproval:true and no approvalId", async () => {
    vi.mocked(db.policy.findUnique).mockResolvedValue({
      id: "1",
      tool_name: "test_tool",
      action: PolicyAction.APPROVAL,
      sandbox_path: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    vi.mocked(db.conversation.findUnique).mockResolvedValue({
      id: "conv-1",
      tokens_used: 10,
      budget_limit: 100,
      budget_reset_at: new Date(),
      createdAt: new Date(),
    });
    vi.mocked(db.approval.create).mockResolvedValue({
      id: "generated-app-id",
      tool_name: "test_tool",
      arguments: {},
      status: ApprovalStatus.PENDING,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const res = await decide(
      { tool_name: "test_tool", arguments: {} },
      { conversationId: "conv-1", token: 5 },
    );

    expect(res.decision).toBe("PENDING");
    expect(res.reason).toBe("generated-app-id");
    expect(db.approval.create).toHaveBeenCalledWith({
      data: {
        tool_name: "test_tool",
        arguments: {},
        status: ApprovalStatus.PENDING,
      },
    });
  });

  it("should fetch approval state and return ALLOW if status is APPROVED", async () => {
    vi.mocked(db.policy.findUnique).mockResolvedValue({
      id: "1",
      tool_name: "test_tool",
      action: PolicyAction.APPROVAL,
      sandbox_path: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    vi.mocked(db.conversation.findUnique).mockResolvedValue({
      id: "conv-1",
      tokens_used: 10,
      budget_limit: 100,
      budget_reset_at: new Date(),
      createdAt: new Date(),
    });
    vi.mocked(db.approval.findUnique).mockResolvedValue({
      id: "app-id-123",
      tool_name: "test_tool",
      arguments: {},
      status: ApprovalStatus.APPROVED,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const res = await decide(
      { tool_name: "test_tool", arguments: {}, approvalId: "app-id-123" },
      { conversationId: "conv-1", token: 5 },
    );

    expect(res.decision).toBe("ALLOW");
    expect(db.approval.delete).toHaveBeenCalledWith({
      where: { id: "app-id-123" },
    });
  });

  it("should return DENY when retrieved approval tool_name does not match the requesting tool_name", async () => {
    vi.mocked(db.policy.findUnique).mockResolvedValue({
      id: "1",
      tool_name: "high_risk_tool",
      action: PolicyAction.APPROVAL,
      sandbox_path: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    vi.mocked(db.conversation.findUnique).mockResolvedValue({
      id: "conv-1",
      tokens_used: 10,
      budget_limit: 100,
      budget_reset_at: new Date(),
      createdAt: new Date(),
    });
    vi.mocked(db.approval.findUnique).mockResolvedValue({
      id: "app-id-123",
      tool_name: "low_risk_tool",
      arguments: {},
      status: ApprovalStatus.APPROVED,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const res = await decide(
      { tool_name: "high_risk_tool", arguments: {}, approvalId: "app-id-123" },
      { conversationId: "conv-1", token: 5 },
    );

    expect(res.decision).toBe("DENY");
    expect(res.reason).toBe("Approval tool name mismatch");
  });
});

describe("Policy Engine REST Endpoints", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET /policies", () => {
    it("should return list of stored policies", async () => {
      const getPolicies = getHandler("/policies", "GET");
      expect(getPolicies).toBeDefined();

      vi.mocked(db.policy.findMany).mockResolvedValue([
        { tool_name: "tool1", action: PolicyAction.ALLOW },
      ] as any);

      const req = {} as Request;
      const res = mockResponse();

      await getPolicies(req, res, () => {});

      expect(res.json).toHaveBeenCalledWith([
        { tool_name: "tool1", action: PolicyAction.ALLOW },
      ]);
    });
  });

  describe("GET /policies/:toolName", () => {
    it("should return the stored policy if it exists", async () => {
      const getSinglePolicy = getHandler("/policies/:toolName", "GET");
      expect(getSinglePolicy).toBeDefined();

      vi.mocked(db.policy.findUnique).mockResolvedValue({
        tool_name: "tool1",
        action: PolicyAction.DENY,
      } as any);

      const req = { params: { toolName: "tool1" } } as any as Request;
      const res = mockResponse();

      await getSinglePolicy(req, res, () => {});

      expect(res.json).toHaveBeenCalledWith({
        tool_name: "tool1",
        action: PolicyAction.DENY,
      });
    });

    it("should return implicit APPROVAL if it does not exist in DB", async () => {
      const getSinglePolicy = getHandler("/policies/:toolName", "GET");
      vi.mocked(db.policy.findUnique).mockResolvedValue(null);

      const req = { params: { toolName: "unknown_tool" } } as any as Request;
      const res = mockResponse();

      await getSinglePolicy(req, res, () => {});

      expect(res.json).toHaveBeenCalledWith({
        tool_name: "unknown_tool",
        action: "APPROVAL",
        implicit: true,
      });
    });
  });

  describe("POST /policies", () => {
    it("should return 409 if policy already exists", async () => {
      const postPolicy = getHandler("/policies", "POST");
      vi.mocked(db.policy.findUnique).mockResolvedValue({
        tool_name: "tool1",
        action: PolicyAction.ALLOW,
      } as any);

      const req = {
        body: { tool_name: "tool1", action: "DENY" },
      } as any as Request;
      const res = mockResponse();

      await postPolicy(req, res, () => {});

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith({ error: "Policy already exists" });
    });
  });

  describe("POST /policies/approvals/:id/approve", () => {
    it("should atomically update status using updateMany and return id and status", async () => {
      const approveHandler = getHandler("/policies/approvals/:id/approve", "POST");
      expect(approveHandler).toBeDefined();

      vi.mocked(db.approval.updateMany).mockResolvedValue({ count: 1 });

      const req = { params: { id: "app-123" } } as any as Request;
      const res = mockResponse();

      await approveHandler(req, res, () => {});

      expect(db.approval.updateMany).toHaveBeenCalledWith({
        where: { id: "app-123", status: ApprovalStatus.PENDING },
        data: { status: ApprovalStatus.APPROVED },
      });
      expect(res.json).toHaveBeenCalledWith({
        id: "app-123",
        status: ApprovalStatus.APPROVED,
      });
    });

    it("should return 404 if approval record does not exist", async () => {
      const approveHandler = getHandler("/policies/approvals/:id/approve", "POST");
      vi.mocked(db.approval.updateMany).mockResolvedValue({ count: 0 });
      vi.mocked(db.approval.findUnique).mockResolvedValue(null);

      const req = { params: { id: "app-invalid" } } as any as Request;
      const res = mockResponse();

      await approveHandler(req, res, () => {});

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: "Approval not found" });
    });

    it("should return 400 if approval status is not PENDING", async () => {
      const approveHandler = getHandler("/policies/approvals/:id/approve", "POST");
      vi.mocked(db.approval.updateMany).mockResolvedValue({ count: 0 });
      vi.mocked(db.approval.findUnique).mockResolvedValue({
        id: "app-123",
        status: ApprovalStatus.APPROVED,
      } as any);

      const req = { params: { id: "app-123" } } as any as Request;
      const res = mockResponse();

      await approveHandler(req, res, () => {});

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: "Approval status is not PENDING" });
    });
  });
});
