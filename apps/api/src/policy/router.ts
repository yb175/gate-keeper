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
    try {
      const policy = await db.policy.findUnique({
        where: { tool_name: toolName },
        select: {
          tool_name: true,
          action: true,
        },
      });

      if (!policy) {
        res.json({
          tool_name: toolName,
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
      where: { tool_name },
    });

    if (existing) {
      res.status(409).json({ error: "Policy already exists" });
      return;
    }

    const created = await db.policy.create({
      data: {
        tool_name,
        action: action as PolicyAction,
      },
      select: {
        tool_name: true,
        action: true,
      },
    });

    res.status(201).json(created);
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /policies/:toolName
router.patch(
  "/policies/:toolName",
  async (req: Request, res: Response): Promise<void> => {
    const { toolName } = req.params;
    const { action } = req.body;

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
        where: { tool_name: toolName },
      });

      if (!existing) {
        res.status(404).json({ error: "Policy not found" });
        return;
      }

      const updated = await db.policy.update({
        where: { tool_name: toolName },
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
    try {
      const existing = await db.policy.findUnique({
        where: { tool_name: toolName },
      });

      if (!existing) {
        res.status(404).json({ error: "Policy not found" });
        return;
      }

      await db.policy.delete({
        where: { tool_name: toolName },
      });

      res.status(204).end();
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

export default router;
