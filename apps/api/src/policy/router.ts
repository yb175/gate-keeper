import { Router, Request, Response } from "express";
import { db, PolicyAction } from "@repo/db";

const router = Router();

// GET /policies
router.get("/policies", async (req: Request, res: Response): Promise<void> => {
  try {
    const policies = await db.policy.findMany({
      select: {
        tool_name: true,
        action: true,
      },
    });
    res.json(policies);
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /policies/:toolName
router.get(
  "/policies/:toolName",
  async (req: Request, res: Response): Promise<void> => {
    const { toolName } = req.params;
    if (!toolName || !toolName.trim()) {
      res.status(400).json({ error: "Missing or invalid toolName parameter" });
      return;
    }
    const normalizedToolName = toolName.trim();
    try {
      const policy = await db.policy.findUnique({
        where: { tool_name: normalizedToolName },
        select: {
          tool_name: true,
          action: true,
        },
      });

      if (!policy) {
        res.json({
          tool_name: normalizedToolName,
          action: "APPROVAL",
          implicit: true,
        });
        return;
      }

      res.json(policy);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

// POST /policies
router.post("/policies", async (req: Request, res: Response): Promise<void> => {
  const { tool_name, action } = req.body;

  if (!tool_name || typeof tool_name !== "string" || !tool_name.trim()) {
    res.status(400).json({ error: "Missing or invalid tool_name" });
    return;
  }

  const normalizedToolName = tool_name.trim();

  if (
    !action ||
    !Object.values(PolicyAction).includes(action as PolicyAction)
  ) {
    res.status(400).json({
      error: "Invalid action. Accepted values are ALLOW, APPROVAL, DENY",
    });
    return;
  }

  try {
    const existing = await db.policy.findUnique({
      where: { tool_name: normalizedToolName },
    });

    if (existing) {
      res.status(409).json({ error: "Policy already exists" });
      return;
    }

    const created = await db.policy.create({
      data: {
        tool_name: normalizedToolName,
        action: action as PolicyAction,
      },
      select: {
        tool_name: true,
        action: true,
      },
    });

    res.status(201).json(created);
  } catch (error: any) {
    if (error.code === "P2002") {
      res.status(409).json({ error: "Policy already exists" });
      return;
    }
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /policies/:toolName
router.patch(
  "/policies/:toolName",
  async (req: Request, res: Response): Promise<void> => {
    const { toolName } = req.params;
    if (!toolName || !toolName.trim()) {
      res.status(400).json({ error: "Missing or invalid toolName parameter" });
      return;
    }
    const { action } = req.body;
    const normalizedToolName = toolName.trim();

    if (
      !action ||
      !Object.values(PolicyAction).includes(action as PolicyAction)
    ) {
      res.status(400).json({
        error: "Invalid action. Accepted values are ALLOW, APPROVAL, DENY",
      });
      return;
    }

    try {
      const existing = await db.policy.findUnique({
        where: { tool_name: normalizedToolName },
      });

      if (!existing) {
        res.status(404).json({ error: "Policy not found" });
        return;
      }

      const updated = await db.policy.update({
        where: { tool_name: normalizedToolName },
        data: {
          action: action as PolicyAction,
        },
        select: {
          tool_name: true,
          action: true,
        },
      });

      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

// DELETE /policies/:toolName
router.delete(
  "/policies/:toolName",
  async (req: Request, res: Response): Promise<void> => {
    const { toolName } = req.params;
    if (!toolName || !toolName.trim()) {
      res.status(400).json({ error: "Missing or invalid toolName parameter" });
      return;
    }
    const normalizedToolName = toolName.trim();
    try {
      const existing = await db.policy.findUnique({
        where: { tool_name: normalizedToolName },
      });

      if (!existing) {
        res.status(404).json({ error: "Policy not found" });
        return;
      }

      await db.policy.delete({
        where: { tool_name: normalizedToolName },
      });

      res.status(204).end();
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

import { ApprovalStatus } from "@repo/db";

// POST /policies/approvals/:id/approve
router.post(
  "/policies/approvals/:id/approve",
  async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    try {
      const approval = await db.approval.findUnique({ where: { id } });
      if (!approval) {
        res.status(404).json({ error: "Approval not found" });
        return;
      }
      const updated = await db.approval.update({
        where: { id },
        data: { status: ApprovalStatus.APPROVED },
      });
      res.json({ message: "Approved successfully", approval: updated });
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// POST /policies/approvals/:id/reject
router.post(
  "/policies/approvals/:id/reject",
  async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    try {
      const approval = await db.approval.findUnique({ where: { id } });
      if (!approval) {
        res.status(404).json({ error: "Approval not found" });
        return;
      }
      const updated = await db.approval.update({
        where: { id },
        data: { status: ApprovalStatus.REJECTED },
      });
      res.json({ message: "Rejected successfully", approval: updated });
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

export default router;
