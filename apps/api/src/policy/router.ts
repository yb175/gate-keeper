import { Router, Request, Response } from "express";
import { db, PolicyAction, ApprovalStatus } from "@repo/db";

const router = Router();

// GET /policies
router.get("/policies", async (req: Request, res: Response): Promise<void> => {
  try {
    const policies = await db.policy.findMany({
      select: {
        tool_name: true,
        action: true,
        sandbox_path: true,
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
          sandbox_path: true,
        },
      });

      if (!policy) {
        res.json({
          tool_name: normalizedToolName,
          action: "APPROVAL",
          implicit: true,
          sandbox_path: null,
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
  const { tool_name, action, sandbox_path } = req.body;

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

  if (sandbox_path !== undefined && sandbox_path !== null && typeof sandbox_path !== "string") {
    res.status(400).json({ error: "sandbox_path must be a string or null" });
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
        sandbox_path: sandbox_path !== undefined ? sandbox_path : null,
      },
      select: {
        tool_name: true,
        action: true,
        sandbox_path: true,
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
    const { action, sandbox_path } = req.body;
    const normalizedToolName = toolName.trim();

    if (action !== undefined && !Object.values(PolicyAction).includes(action as PolicyAction)) {
      res.status(400).json({
        error: "Invalid action. Accepted values are ALLOW, APPROVAL, DENY",
      });
      return;
    }

    if (sandbox_path !== undefined && sandbox_path !== null && typeof sandbox_path !== "string") {
      res.status(400).json({ error: "sandbox_path must be a string or null" });
      return;
    }

    if (action === undefined && sandbox_path === undefined) {
      res.status(400).json({ error: "Either action or sandbox_path must be provided to update" });
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

      const updateData: any = {};
      if (action !== undefined) {
        updateData.action = action as PolicyAction;
      }
      if (sandbox_path !== undefined) {
        updateData.sandbox_path = sandbox_path;
      }

      const updated = await db.policy.update({
        where: { tool_name: normalizedToolName },
        data: updateData,
        select: {
          tool_name: true,
          action: true,
          sandbox_path: true,
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

async function handleApprovalStatusUpdate(
  id: string,
  targetStatus: ApprovalStatus,
  res: Response
): Promise<void> {
  try {
    const updateResult = await db.approval.updateMany({
      where: {
        id,
        status: ApprovalStatus.PENDING,
      },
      data: {
        status: targetStatus,
      },
    });

    if (updateResult.count === 0) {
      const exists = await db.approval.findUnique({ where: { id } });
      if (!exists) {
        res.status(404).json({ error: "Approval not found" });
        return;
      }
      if (exists.status === targetStatus) {
        res.json({ id, status: targetStatus });
        return;
      }
      res.status(400).json({ error: "Approval status is not PENDING" });
      return;
    }

    res.json({ id, status: targetStatus });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
}

// POST /policies/approvals/:id/approve
router.post(
  "/policies/approvals/:id/approve",
  async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    if (!id || !id.trim()) {
      res.status(400).json({ error: "Missing or invalid id parameter" });
      return;
    }
    await handleApprovalStatusUpdate(id.trim(), ApprovalStatus.APPROVED, res);
  }
);

// POST /policies/approvals/:id/reject
router.post(
  "/policies/approvals/:id/reject",
  async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    if (!id || !id.trim()) {
      res.status(400).json({ error: "Missing or invalid id parameter" });
      return;
    }
    await handleApprovalStatusUpdate(id.trim(), ApprovalStatus.REJECTED, res);
  }
);

function parsePaginationParams(req: Request): { page?: number; limit?: number; error?: string } {
  const pageStr = req.query?.page;
  const limitStr = req.query?.limit;

  let page: number | undefined;
  let limit: number | undefined;

  if (pageStr !== undefined) {
    if (typeof pageStr !== "string" || !/^\d+$/.test(pageStr)) {
      return { error: "page must be a positive integer greater than or equal to 1" };
    }
    const parsedPage = parseInt(pageStr, 10);
    if (parsedPage < 1) {
      return { error: "page must be a positive integer greater than or equal to 1" };
    }
    page = parsedPage;
  }

  if (limitStr !== undefined) {
    if (typeof limitStr !== "string" || !/^\d+$/.test(limitStr)) {
      return { error: "limit must be a positive integer between 1 and 100" };
    }
    const parsedLimit = parseInt(limitStr, 10);
    if (parsedLimit < 1 || parsedLimit > 100) {
      return { error: "limit must be a positive integer between 1 and 100" };
    }
    limit = parsedLimit;
  }

  return { page, limit };
}

// GET /approvals
router.get("/approvals", async (req: Request, res: Response): Promise<void> => {
  try {
    const { page, limit, error } = parsePaginationParams(req);
    if (error) {
      res.status(400).json({ error });
      return;
    }

    if (page !== undefined || limit !== undefined) {
      const p = page || 1;
      const l = limit || 100;
      const skip = (p - 1) * l;
      const total = await db.approval.count();
      const approvals = await db.approval.findMany({
        orderBy: { createdAt: "desc" },
        skip,
        take: l,
      });
      res.json({
        data: approvals,
        pagination: {
          total,
          page: p,
          limit: l,
          pages: Math.ceil(total / l),
        }
      });
      return;
    }

    const approvals = await db.approval.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    res.json(approvals);
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /logs
router.get("/logs", async (req: Request, res: Response): Promise<void> => {
  try {
    const { page, limit, error } = parsePaginationParams(req);
    if (error) {
      res.status(400).json({ error });
      return;
    }

    if (page !== undefined || limit !== undefined) {
      const p = page || 1;
      const l = limit || 100;
      const skip = (p - 1) * l;
      const total = await db.log.count();
      const logs = await db.log.findMany({
        orderBy: { createdAt: "desc" },
        skip,
        take: l,
      });
      res.json({
        data: logs,
        pagination: {
          total,
          page: p,
          limit: l,
          pages: Math.ceil(total / l),
        }
      });
      return;
    }

    const logs = await db.log.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    res.json(logs);
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /logs
router.delete("/logs", async (req: Request, res: Response): Promise<void> => {
  try {
    await db.log.deleteMany();
    res.status(204).end();
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
