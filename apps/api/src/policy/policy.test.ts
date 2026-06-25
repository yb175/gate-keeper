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
        findMany: vi.fn(),
      },
      log: {
        create: vi.fn(),
        findMany: vi.fn(),
        deleteMany: vi.fn(),
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
import withinSandboxPath from "./rules/pathRule.js";
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

    it("should deny when path argument escapes the configured sandbox_path", async () => {
      vi.mocked(db.policy.findUnique).mockResolvedValue({
        id: "1",
        tool_name: "write_file",
        action: PolicyAction.ALLOW,
        sandbox_path: "/tmp/sandbox",
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
        { tool_name: "write_file", arguments: { path: "../../etc/passwd" } },
        { conversationId: "conv-1", token: 10 },
      );

      expect(res.allowed).toBe(false);
      expect(res.requiresApproval).toBe(false);
      expect(res.reason).toMatch(/escapes the configured sandbox/);
    });

    it("should allow when path argument is within the configured sandbox_path", async () => {
      vi.mocked(db.policy.findUnique).mockResolvedValue({
        id: "1",
        tool_name: "write_file",
        action: PolicyAction.ALLOW,
        sandbox_path: "/tmp/sandbox",
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
        { tool_name: "write_file", arguments: { path: "notes/hello.txt" } },
        { conversationId: "conv-1", token: 10 },
      );

      // Not blocked, not escaped — ends up at the approval check
      // (no sandbox_path escape, budget OK → allowed by ALLOW policy)
      expect(res.allowed).toBe(true);
      expect(res.requiresApproval).toBe(false);
    });
  });
});

describe("Rule: withinSandboxPath", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should skip the check and return result:false when no sandbox_path is configured", async () => {
    vi.mocked(db.policy.findUnique).mockResolvedValue({
      id: "1",
      tool_name: "write_file",
      action: PolicyAction.ALLOW,
      sandbox_path: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const res = await withinSandboxPath("write_file", { path: "../../etc/passwd" });
    expect(res.success).toBe(true);
    expect(res.result).toBe(false); // rule skipped — not a violation
  });

  it("should skip the check when the tool has no string arguments", async () => {
    vi.mocked(db.policy.findUnique).mockResolvedValue({
      id: "1",
      tool_name: "list_files",
      action: PolicyAction.ALLOW,
      sandbox_path: "/tmp/sandbox",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const res = await withinSandboxPath("list_files", {});
    expect(res.success).toBe(true);
    expect(res.result).toBe(false);
  });

  it("should return result:false (allowed) for a valid path inside the sandbox", async () => {
    vi.mocked(db.policy.findUnique).mockResolvedValue({
      id: "1",
      tool_name: "write_file",
      action: PolicyAction.ALLOW,
      sandbox_path: "/tmp/sandbox",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const res = await withinSandboxPath("write_file", { path: "notes/hello.txt" });
    expect(res.success).toBe(true);
    expect(res.result).toBe(false);
  });

  it("should return result:true (violation) for a relative traversal path", async () => {
    vi.mocked(db.policy.findUnique).mockResolvedValue({
      id: "1",
      tool_name: "write_file",
      action: PolicyAction.ALLOW,
      sandbox_path: "/tmp/sandbox",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const res = await withinSandboxPath("write_file", { path: "../../etc/passwd" });
    expect(res.success).toBe(true);
    expect(res.result).toBe(true);
    expect(res.reason).toMatch(/escapes the configured sandbox/);
  });

  it("should return result:true (violation) for an absolute path that escapes the sandbox", async () => {
    vi.mocked(db.policy.findUnique).mockResolvedValue({
      id: "1",
      tool_name: "read_file",
      action: PolicyAction.ALLOW,
      sandbox_path: "/tmp/sandbox",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const res = await withinSandboxPath("read_file", { path: "/etc/passwd" });
    expect(res.success).toBe(true);
    expect(res.result).toBe(true);
    expect(res.reason).toMatch(/escapes the configured sandbox/);
  });

  it("should return result:false for a path prefixed with the sandbox basename", async () => {
    vi.mocked(db.policy.findUnique).mockResolvedValue({
      id: "1",
      tool_name: "write_file",
      action: PolicyAction.ALLOW,
      sandbox_path: "/tmp/sandbox",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Agent passes "sandbox/notes/file.txt" — the prefix should be stripped
    const res = await withinSandboxPath("write_file", { path: "sandbox/notes/file.txt" });
    expect(res.success).toBe(true);
    expect(res.result).toBe(false);
  });

  it("should return result:true (violation) for a move_file where destination escapes", async () => {
    vi.mocked(db.policy.findUnique).mockResolvedValue({
      id: "1",
      tool_name: "move_file",
      action: PolicyAction.ALLOW,
      sandbox_path: "/tmp/sandbox",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // source is fine, but destination escapes the sandbox
    const res = await withinSandboxPath("move_file", {
      source: "notes/file.txt",
      destination: "../../outside.txt",
    });
    expect(res.success).toBe(true);
    expect(res.result).toBe(true);
    expect(res.reason).toMatch(/escapes the configured sandbox/);
  });

  it("should return result:true (violation) for an empty path argument", async () => {
    vi.mocked(db.policy.findUnique).mockResolvedValue({
      id: "1",
      tool_name: "write_file",
      action: PolicyAction.ALLOW,
      sandbox_path: "/tmp/sandbox",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const res = await withinSandboxPath("write_file", { path: "" });
    expect(res.success).toBe(true);
    expect(res.result).toBe(true);
    expect(res.reason).toMatch(/must not be empty/);
  });

  it("should fail closed (success:false) on a database error", async () => {
    vi.mocked(db.policy.findUnique).mockRejectedValue(new Error("DB failure"));

    const res = await withinSandboxPath("write_file", { path: "file.txt" });
    expect(res.success).toBe(false);
    expect(res.result).toBe(false);
    expect(res.reason).toBe("Failed to evaluate path sandbox rule");
  });

  it("uses pre-fetched policy and does not call db.policy.findUnique", async () => {
    const preFetched = {
      id: "1",
      tool_name: "write_file",
      action: PolicyAction.ALLOW,
      sandbox_path: "/tmp/sandbox",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const res = await withinSandboxPath("write_file", { path: "ok.txt" }, preFetched);
    expect(db.policy.findUnique).not.toHaveBeenCalled();
    expect(res.success).toBe(true);
    expect(res.result).toBe(false);
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

    it("should return 200 (idempotent) if approval status is already APPROVED", async () => {
      const approveHandler = getHandler("/policies/approvals/:id/approve", "POST");
      vi.mocked(db.approval.updateMany).mockResolvedValue({ count: 0 });
      vi.mocked(db.approval.findUnique).mockResolvedValue({
        id: "app-123",
        status: ApprovalStatus.APPROVED,
      } as any);

      const req = { params: { id: "app-123" } } as any as Request;
      const res = mockResponse();

      await approveHandler(req, res, () => {});

      expect(res.json).toHaveBeenCalledWith({ id: "app-123", status: ApprovalStatus.APPROVED });
    });

    it("should return 400 if approval status is REJECTED", async () => {
      const approveHandler = getHandler("/policies/approvals/:id/approve", "POST");
      vi.mocked(db.approval.updateMany).mockResolvedValue({ count: 0 });
      vi.mocked(db.approval.findUnique).mockResolvedValue({
        id: "app-123",
        status: ApprovalStatus.REJECTED,
      } as any);

      const req = { params: { id: "app-123" } } as any as Request;
      const res = mockResponse();

      await approveHandler(req, res, () => {});

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: "Approval status is not PENDING" });
    });
  });

  describe("POST /policies/approvals/:id/reject", () => {
    it("should atomically update status using updateMany and return id and status for rejection", async () => {
      const rejectHandler = getHandler("/policies/approvals/:id/reject", "POST");
      expect(rejectHandler).toBeDefined();

      vi.mocked(db.approval.updateMany).mockResolvedValue({ count: 1 });

      const req = { params: { id: "app-123" } } as any as Request;
      const res = mockResponse();

      await rejectHandler(req, res, () => {});

      expect(db.approval.updateMany).toHaveBeenCalledWith({
        where: { id: "app-123", status: ApprovalStatus.PENDING },
        data: { status: ApprovalStatus.REJECTED },
      });
      expect(res.json).toHaveBeenCalledWith({
        id: "app-123",
        status: ApprovalStatus.REJECTED,
      });
    });

    it("should return 404 if approval record does not exist on rejection", async () => {
      const rejectHandler = getHandler("/policies/approvals/:id/reject", "POST");
      vi.mocked(db.approval.updateMany).mockResolvedValue({ count: 0 });
      vi.mocked(db.approval.findUnique).mockResolvedValue(null);

      const req = { params: { id: "app-invalid" } } as any as Request;
      const res = mockResponse();

      await rejectHandler(req, res, () => {});

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: "Approval not found" });
    });

    it("should return 200 (idempotent) if approval status is already REJECTED on rejection", async () => {
      const rejectHandler = getHandler("/policies/approvals/:id/reject", "POST");
      vi.mocked(db.approval.updateMany).mockResolvedValue({ count: 0 });
      vi.mocked(db.approval.findUnique).mockResolvedValue({
        id: "app-123",
        status: ApprovalStatus.REJECTED,
      } as any);

      const req = { params: { id: "app-123" } } as any as Request;
      const res = mockResponse();

      await rejectHandler(req, res, () => {});

      expect(res.json).toHaveBeenCalledWith({ id: "app-123", status: ApprovalStatus.REJECTED });
    });

    it("should return 400 if approval status is APPROVED on rejection", async () => {
      const rejectHandler = getHandler("/policies/approvals/:id/reject", "POST");
      vi.mocked(db.approval.updateMany).mockResolvedValue({ count: 0 });
      vi.mocked(db.approval.findUnique).mockResolvedValue({
        id: "app-123",
        status: ApprovalStatus.APPROVED,
      } as any);

      const req = { params: { id: "app-123" } } as any as Request;
      const res = mockResponse();

      await rejectHandler(req, res, () => {});

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: "Approval status is not PENDING" });
    });
  });

  describe("GET /approvals", () => {
    it("should return a list of approvals", async () => {
      const getApprovals = getHandler("/approvals", "GET");
      expect(getApprovals).toBeDefined();

      vi.mocked(db.approval.findMany).mockResolvedValue([
        { id: "app-123", tool_name: "test_tool", status: "PENDING" }
      ] as any);

      const req = {} as Request;
      const res = mockResponse();

      await getApprovals(req, res, () => {});

      expect(db.approval.findMany).toHaveBeenCalledWith({
        orderBy: { createdAt: "desc" }
      });
      expect(res.json).toHaveBeenCalledWith([
        { id: "app-123", tool_name: "test_tool", status: "PENDING" }
      ]);
    });
  });

  describe("GET /logs", () => {
    it("should return a list of decision logs", async () => {
      const getLogs = getHandler("/logs", "GET");
      expect(getLogs).toBeDefined();

      vi.mocked(db.log.findMany).mockResolvedValue([
        { id: "log-123", tool_name: "test_tool", decision: "ALLOW" }
      ] as any);

      const req = {} as Request;
      const res = mockResponse();

      await getLogs(req, res, () => {});

      expect(db.log.findMany).toHaveBeenCalledWith({
        orderBy: { createdAt: "desc" }
      });
      expect(res.json).toHaveBeenCalledWith([
        { id: "log-123", tool_name: "test_tool", decision: "ALLOW" }
      ]);
    });
  });

  describe("DELETE /logs", () => {
    it("should delete all logs and return 204", async () => {
      const deleteLogs = getHandler("/logs", "DELETE");
      expect(deleteLogs).toBeDefined();

      vi.mocked(db.log.deleteMany).mockResolvedValue({ count: 5 } as any);

      const req = {} as Request;
      const res = mockResponse();

      await deleteLogs(req, res, () => {});

      expect(db.log.deleteMany).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(204);
    });
  });
});
